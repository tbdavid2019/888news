// Backfills missing topic tags for existing articles in publications and analyses based on keyword/pattern matching.
// Useful when new topics and taxonomy tags are introduced to the system.
//
// Usage:
//   node --env-file=.env scripts/backfill-topic-tags.ts [--dry-run]
import { closeDb, sql } from "@aihot/backend/db";
import { seedTopics, topicPageCounts, listTopics } from "@aihot/backend/publication/topics";

interface BackfillRule {
  tag: string;
  slug: string;
  regex: string;
  description: string;
}

const BACKFILL_RULES: BackfillRule[] = [
  {
    tag: "資訊安全",
    slug: "infosec",
    regex: "\\b(cve|0-day|0day|rce|poc|infosec|cybersecurity|malware|ransomware|phishing|xss|sqli|csrf|exploit|vulnerability|vulnerabilities)\\b|漏洞|零日|提權|滲透測試|逆向工程|資安|駭客|安全防護|供應鏈安全|越權",
    description: "資安漏洞、CVE、零日與滲透攻防",
  },
  {
    tag: "系統架構",
    slug: "systems",
    regex: "\\b(linux|kernel|ebpf|operating system|distributed systems?|kubernetes|k8s|microservices|distributed database|database engine|networking protocol|storage engine|posix|virtualization|containerization)\\b|作業系統|系統核心|內核|分散式系統|分散式架構|分散式資料庫|分散式運算|分散式儲存|微服務架構|網路協定|資料庫引擎|儲存引擎|高併發架構|高可用架構|虛擬化|容器化",
    description: "Linux、核心、分散式架構與基礎設施",
  },
  {
    tag: "程式語言",
    slug: "languages",
    regex: "\\b(rust|golang|zig|c\\+\\+|typescript|compiler|llvm|garbage collector|bytecode|wasm|webassembly)\\b|程式語言|編譯器|型別系統|位元組碼|編程語言",
    description: "現代語言、編譯器與 Runtime",
  },
  {
    tag: "開發工具",
    slug: "dev-tools",
    regex: "\\b(neovim|vim|tmux|terminal|cli|tui|git|devtools|package manager|cargo|npm|pnpm|bundler|debugger|vscode extension)\\b|開發工具|命令行|終端機|套件管理|套件管理器",
    description: "終端 CLI、TUI、編輯器與套件管理",
  },
  {
    tag: "硬體/半導體",
    slug: "hardware",
    regex: "\\b(gpu|cpu|tpu|npu|asic|fpga|risc-v|semiconductor|wafer|vram|hbm|soc)\\b|半導體|晶片|晶圓|硬體架構|台積電|加速卡|顯卡|晶片製程",
    description: "晶片、加速卡與半導體供應鏈",
  },
  {
    tag: "獨立開發",
    slug: "indie-dev",
    regex: "\\b(indie hacker|indie hackers|indiehacker|show hn|side project|self-hosted|bootstrapped|solopreneur)\\b|獨立開發|自託管|一人公司|一人創業|一人開發",
    description: "Indie Hackers、Side Project 與自託管",
  },
  {
    tag: "前沿科學",
    slug: "science",
    regex: "\\b(quantum computing|nuclear fusion|aerospace|superconductor|neuroscience|crispr|biotechnology)\\b|量子計算|量子電腦|核融合|航太科技|太空探索|超導體|神經科學|基因編輯|前沿科學",
    description: "量子計算、核融合、航太與硬科技",
  },
  {
    tag: "數位權益",
    slug: "digital-rights",
    regex: "\\b(privacy|antitrust|monopoly|open web|gpl|mit license|copyleft|copyright|digital rights|surveillance|gdpr)\\b|隱私|反壟斷|開放網路|數位權利|數位權益|著作權|版權|開源授權|自由軟體",
    description: "隱私監管、反壟斷與開源授權",
  },
];

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  console.log(`Starting topic tags backfill (${isDryRun ? "DRY RUN MODE" : "EXECUTE MODE"})...\n`);

  let totalPubsUpdated = 0;
  let totalAnalysesUpdated = 0;

  for (const rule of BACKFILL_RULES) {
    // 1. Check matching publications
    const candidates = await sql<{ article_id: string; title: string }[]>`
      SELECT article_id, title
      FROM publications
      WHERE search_text ~* ${rule.regex}
        AND (tags IS NULL OR NOT (${rule.tag} = ANY(tags)))
    `;

    console.log(`[${rule.tag}] (${rule.slug}) - ${rule.description}`);
    console.log(`  Found ${candidates.length} candidate articles.`);

    if (candidates.length === 0) {
      console.log(`  Nothing to update for ${rule.tag}.\n`);
      continue;
    }

    // Print sample titles
    const sample = candidates.slice(0, 3).map((c) => `"${c.title}"`).join(", ");
    console.log(`  Sample matches: ${sample}${candidates.length > 3 ? "..." : ""}`);

    if (isDryRun) {
      console.log(`  [DRY RUN] Would tag ${candidates.length} publications.\n`);
      continue;
    }

    const articleIds = candidates.map((c) => c.article_id);

    // 2. Update publications
    const updatedPubs = await sql<{ article_id: string }[]>`
      UPDATE publications
      SET tags = array_append(COALESCE(tags, ARRAY[]::text[]), ${rule.tag}),
          updated_at = now()
      WHERE article_id = ANY(${articleIds})
        AND (tags IS NULL OR NOT (${rule.tag} = ANY(tags)))
      RETURNING article_id
    `;

    // 3. Update corresponding analyses
    const updatedAnalyses = await sql<{ id: string }[]>`
      UPDATE analyses
      SET tags = array_append(COALESCE(tags, ARRAY[]::text[]), ${rule.tag})
      WHERE article_id = ANY(${articleIds})
        AND (tags IS NULL OR NOT (${rule.tag} = ANY(tags)))
      RETURNING id
    `;

    console.log(`  Updated: ${updatedPubs.length} publications, ${updatedAnalyses.length} analyses.\n`);
    totalPubsUpdated += updatedPubs.length;
    totalAnalysesUpdated += updatedAnalyses.length;
  }

  console.log(`Backfill finished:`);
  console.log(`  Total publications updated: ${totalPubsUpdated}`);
  console.log(`  Total analyses updated: ${totalAnalysesUpdated}\n`);

  if (!isDryRun) {
    console.log("Refreshing topics and counts cache...");
    await seedTopics();
    const counts = await topicPageCounts();
    const topics = await listTopics();
    const countMap = new Map(counts.map((c) => [c.slug, c.total]));
    console.log("Updated counts for target topics:");
    for (const rule of BACKFILL_RULES) {
      console.log(`  ${rule.tag} (${rule.slug}): ${countMap.get(rule.slug) ?? 0} articles`);
    }
  }

  await closeDb();
}

main().catch(async (err) => {
  console.error("Backfill failed:", err);
  await closeDb().catch(() => {});
  process.exit(1);
});
