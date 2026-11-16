// LiveBench (Apache 2.0): the latest release's per-task table; category scores are means of unrounded
// task scores, and each board averages its category pair (general: all categories).
import { guardedFetch } from "../../../lib/http-fetch.ts";
import { configurationOf, peelEffortSuffix, slug } from "../configuration.ts";
import { parseCsv } from "../csv.ts";
import type { FetchResult, Fetcher, ParsedRow } from "../types.ts";

const BOARDS = [
  { key: "livebench-general", name: "LiveBench Global Average", categories: null as string[] | null, url: "https://livebench.ai/" },
  { key: "livebench-writing", name: "LiveBench · 语言与指令", categories: ["Language", "IF"], url: "https://livebench.ai/#/?cats=Language%2CIF&ft=1" },
  { key: "livebench-coding", name: "LiveBench · 编程综合", categories: ["Coding", "Agentic Coding"], url: "https://livebench.ai/#/?cats=Coding%2CAgentic+Coding&ft=1" },
  { key: "livebench-reasoning", name: "LiveBench · 推理与数学", categories: ["Reasoning", "Mathematics"], url: "https://livebench.ai/#/?cats=Reasoning%2CMathematics&ft=1" },
];

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function weightedMean(values: number[], cats: string[], weights: Record<string, number>): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < cats.length; i++) {
    const w = typeof weights[cats[i]!] === "number" && Number.isFinite(weights[cats[i]!]!) && weights[cats[i]!]! > 0 ? weights[cats[i]!]! : 1;
    num += values[i]! * w;
    den += w;
  }
  return num / den;
}

interface ReleaseRef {
  release: string;
  tag: string;
  gen: "v1" | "v2";
}

/** The newest release date the site lists (its bundle carries the v1 and/or v2 release arrays). */
async function latestRelease(): Promise<ReleaseRef> {
  const home = (await guardedFetch("https://livebench.ai/", { timeoutMs: 30_000 })).text();
  const js = /src="\.?\/?(static\/js\/main\.[a-z0-9]+\.js)"/.exec(home)?.[1];
  if (!js) throw new Error("livebench: bundle not found");
  const bundle = (await guardedFetch(`https://livebench.ai/${js}`, { timeoutMs: 30_000, maxBytes: 16 * 1024 * 1024 })).text();
  const candidates: ReleaseRef[] = [];
  for (const m of bundle.matchAll(/\[((?:"\d{4}-\d{2}-\d{2}",?){3,})\]/g)) {
    for (const d of m[1]!.match(/\d{4}-\d{2}-\d{2}/g) ?? []) {
      candidates.push({ release: d, tag: d.replaceAll("-", "_"), gen: "v1" });
    }
  }
  for (const m of bundle.matchAll(/\[((?:"20\d{6}",?){2,})\]/g)) {
    for (const d of m[1]!.match(/20\d{6}/g) ?? []) {
      const release = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
      candidates.push({ release, tag: d, gen: "v2" });
    }
  }
  if (!candidates.length) throw new Error("livebench: release list not found");
  candidates.sort((a, b) => a.release.localeCompare(b.release));
  return candidates.pop()!;
}

async function fetchReleaseData(ref: ReleaseRef) {
  if (ref.gen === "v2") {
    const categories = JSON.parse((await guardedFetch(`https://livebench.ai/data/${ref.tag}/categories.json`, { timeoutMs: 30_000 })).text()) as Record<string, unknown>;
    const table = await guardedFetch(`https://livebench.ai/data/${ref.tag}/table.csv`, { timeoutMs: 30_000 });
    if (table.status !== 200) throw new Error(`livebench table ${ref.release} HTTP ${table.status}`);
    return { categories, table };
  }
  const catRes = await guardedFetch(`https://livebench.ai/categories_${ref.tag}.json`, { timeoutMs: 30_000 });
  const catText = catRes.status === 200
    ? catRes.text()
    : (await guardedFetch(`https://livebench.ai/v1/categories_${ref.tag}.json`, { timeoutMs: 30_000 })).text();
  const categories = JSON.parse(catText) as Record<string, unknown>;
  let table = await guardedFetch(`https://livebench.ai/table_${ref.tag}.csv`, { timeoutMs: 30_000 });
  if (table.status === 404) {
    table = await guardedFetch(`https://livebench.ai/v1/table_${ref.tag}.csv`, { timeoutMs: 30_000 });
  }
  if (table.status !== 200) throw new Error(`livebench table ${ref.release} HTTP ${table.status}`);
  return { categories, table };
}

function resolveBoardCategories(key: string, defaultCats: string[] | null, categoryTasks: Record<string, string[]>): string[] {
  if (!defaultCats) return Object.keys(categoryTasks);
  if (key === "livebench-coding") {
    if ("Agentic Coding" in categoryTasks) return ["Coding", "Agentic Coding"].filter((c) => c in categoryTasks);
    return ["Coding", "Long Agentic"].filter((c) => c in categoryTasks);
  }
  return defaultCats.filter((c) => c in categoryTasks);
}

export const livebench: Fetcher = {
  sourceKeys: BOARDS.map((b) => b.key),
  async fetch() {
    const ref = await latestRelease();
    const { release } = ref;
    const { categories: rawCategories, table } = await fetchReleaseData(ref);
    const categoryTasks: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(rawCategories)) {
      if (!k.startsWith("_") && Array.isArray(v)) categoryTasks[k] = v as string[];
    }
    const overallWeights = typeof rawCategories._overall_weights === "object" && rawCategories._overall_weights
      ? (rawCategories._overall_weights as Record<string, number>)
      : {};
    const upstream = table.headers.get("last-modified");
    const lines = parseCsv(table.text());
    const modelColumn = Object.keys(lines[0] ?? {})[0];
    const out: FetchResult[] = [];
    for (const b of BOARDS) {
      const cats = resolveBoardCategories(b.key, b.categories, categoryTasks);
      const rows: ParsedRow[] = [];
      if (cats.length) {
        for (const line of lines) {
          const model = modelColumn ? line[modelColumn]?.trim() : null;
          if (!model) continue;
          const categoryScores: number[] = [];
          for (const c of cats) {
            const vals = (categoryTasks[c] ?? []).map((t) => line[t]?.trim()).filter((v) => v != null && v !== "").map(Number).filter(Number.isFinite);
            if (vals.length === (categoryTasks[c] ?? []).length && vals.length) categoryScores.push(mean(vals));
          }
          if (categoryScores.length !== cats.length) continue;
          const peeled = peelEffortSuffix(model);
          const rawScore = b.key === "livebench-general" ? weightedMean(categoryScores, cats, overallWeights) : mean(categoryScores);
          rows.push({
            sourceModelName: model,
            keyName: slug(model),
            baseName: peeled.base,
            configuration: configurationOf(peeled.tier ? [peeled.tier] : []),
            metricKey: b.key,
            metricName: b.name,
            rawScore,
            // Each category's own score, shown beside the pair on a model's evidence.
            metadata: {
              release, categories: cats.join(" + "), categoryCount: cats.length, metricDirection: "HIGHER",
              ...Object.fromEntries(cats.map((c, i) => [`livebenchCategoryScore:${c}`, categoryScores[i]!])),
              livebenchTaskScores: Object.fromEntries(cats.flatMap((c) => (categoryTasks[c] ?? []).map((task) => [task, Number(line[task])]))),
            },
          });
        }
      }
      out.push({
        sourceKey: b.key,
        sourceName: b.name,
        sourceUrl: "https://livebench.ai/",
        license: "Apache 2.0",
        attributionUrl: b.url,
        publishedAt: upstream ? new Date(upstream).toISOString() : null,
        rows,
        metadata: { release, taskGroups: Object.fromEntries(cats.map((c) => [c, categoryTasks[c]])), upstreamPublishedAt: upstream ? new Date(upstream).toISOString() : null, sourceOperator: "LiveBench", sourceFamily: "rolling-objective", metricCount: 1 },
      });
    }
    return out;
  },
};
