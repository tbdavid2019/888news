import { SITE } from "@aihot/industry/site";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Route } from "./+types/source-new";
import { useAdminAction } from "../../features/admin/action";
import { bj } from "../../features/admin/format";
import { KIND_LABEL, MODE_LABEL, TIER_LABEL } from "../../features/admin/labels";
import { AdminPage, Button, Card, Empty, Field, Input, Select, Textarea } from "../../features/admin/ui";

export const meta: Route.MetaFunction = () => [{ title: `建立信源 · ${SITE.name} 後台` }];

const TEMPLATES: Record<string, Record<string, unknown>> = {
  rss: { feedUrl: "https://example.com/feed.xml" },
  web_list: { url: "https://example.com/blog", baseUrl: "https://example.com", itemSelector: "article", linkSelector: "a", titleSelector: "h2", allowUrlPrefixes: ["https://example.com/blog/"] },
  json_list: { url: "https://example.com/api/posts", mode: "json_api", method: "GET", itemsPath: "data.items", titlePaths: ["title"], urlTemplate: "{raw:url}", summaryPaths: ["summary"] },
  x_search: { query: "from:handle -filter:replies", searchType: "Latest" },
  mp_account: { biz: "", name: "" },
  external: {},
};

interface Preview {
  ms: number;
  count: number;
  items: Array<{ title: string; url: string; publishedAt: string | null; excerpt: string }>;
}

export default function NewSource() {
  const navigate = useNavigate();
  const { run, pending } = useAdminAction();
  const [form, setForm] = useState({ id: "", name: "", kind: "rss", tier: "T2", participation_mode: "editorial", interval_minutes: 30, first_party: false, site_fulltext: true, syndicate_fulltext: false, tags: "" });
  const [config, setConfig] = useState(JSON.stringify(TEMPLATES.rss, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);

  const parsed = () => {
    try {
      setError(null);
      return JSON.parse(config) as Record<string, unknown>;
    } catch (e) {
      setError(`設定內容非合法 JSON：${(e as Error).message}`);
      return null;
    }
  };

  return (
    <AdminPage title="建立信源" subtitle="先判重、先預覽：優先 RSS/JSON 等穩定協定；首抓成功且有真實條目才算接入完成。一手身份要有營運主體或官方交叉連結證據。">
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <Card title="信源定義">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ID" hint="小寫字母、數字、連字號與底線（_），若為 X 帳號建議直接輸入 handle（如 elonmusk）">
              <Input
                value={form.id}
                onChange={(e) => {
                  const newId = e.target.value.toLowerCase();
                  setForm((prev) => ({ ...prev, id: newId }));
                  if (form.kind === "x_search") {
                    try {
                      const cur = JSON.parse(config);
                      if (cur.query && typeof cur.query === "string" && (cur.query.includes("from:handle") || (form.id && cur.query.includes(`from:${form.id}`)))) {
                        cur.query = `from:${newId || "handle"} -filter:replies`;
                        setConfig(JSON.stringify(cur, null, 2));
                      }
                    } catch {}
                  }
                }}
                placeholder="elonmusk"
              />
            </Field>
            <Field label="名稱">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Elon Musk" />
            </Field>
            <Field label="類型">
              <Select
                value={form.kind}
                onChange={(e) => {
                  const k = e.target.value;
                  setForm({ ...form, kind: k });
                  if (k === "x_search" && form.id) {
                    setConfig(JSON.stringify({ query: `from:${form.id} -filter:replies`, searchType: "Latest" }, null, 2));
                  } else {
                    setConfig(JSON.stringify(TEMPLATES[k] ?? {}, null, 2));
                  }
                  setPreview(null);
                }}
              >
                {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="採集間隔（分鐘）">
              <Input type="number" min={1} max={1440} value={form.interval_minutes} onChange={(e) => setForm({ ...form, interval_minutes: Number(e.target.value) })} />
            </Field>
            <Field label="參與方式">
              <Select value={form.participation_mode} onChange={(e) => setForm({ ...form, participation_mode: e.target.value })}>
                {Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="等級">
              <Select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
                {Object.entries(TIER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="標籤（逗號分隔）">
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </Field>
            <div className="flex flex-col justify-end gap-2 text-[13px] text-ink-2">
              {([
                ["first_party", "一手信源"],
                ["site_fulltext", "站內可展示全文"],
                ["syndicate_fulltext", "對外介面可帶全文"],
              ] as const).map(([k, label]) => (
                <label key={k} className="inline-flex items-center gap-2">
                  <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <Field label="採集配置（JSON）">
              <Textarea className="font-mono !text-[12px]" rows={10} value={config} onChange={(e) => setConfig(e.target.value)} spellCheck={false} />
            </Field>
            {error && <div className="mt-1 text-[12.5px] text-hot">{error}</div>}
          </div>
          {duplicate && (
            <div className="mt-4 rounded-card bg-amber/10 px-4 py-3 text-[13px] text-ink-2 ring-1 ring-amber/25">
              這個位址已經在監控：<Link className="font-medium text-accent" to={`/admin/sources/${encodeURIComponent(duplicate.id)}`}>{duplicate.name}</Link>（{duplicate.id}）。未新建。
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button
              busy={pending === "preview"}
              onClick={async () => {
                const c = parsed();
                if (!c) return;
                if (form.kind === "x_search" && typeof c.query === "string" && c.query.includes("from:handle")) {
                  c.query = `from:${form.id || "elonmusk"} -filter:replies`;
                }
                const r = await run<Preview>("POST", "/api/admin/sources/preview", { id: form.id || "draft", kind: form.kind, config: c }, { label: "preview", revalidate: false });
                if (r) setPreview(r);
              }}
            >
              預覽抓取
            </Button>
            <Button
              tone="primary"
              busy={pending === "create"}
              disabled={!form.id || !form.name}
              onClick={async () => {
                const c = parsed();
                if (!c) return;
                if (form.kind === "x_search" && typeof c.query === "string" && c.query.includes("from:handle")) {
                  c.query = `from:${form.id || "elonmusk"} -filter:replies`;
                }
                const r = await run<{ created: boolean; duplicate?: { id: string; name: string }; source?: { id: string } }>(
                  "POST",
                  "/api/admin/sources",
                  { ...form, tags: form.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean), config: c },
                  { label: "create", revalidate: false },
                );
                if (!r) return;
                if (!r.created && r.duplicate) setDuplicate(r.duplicate);
                else if (r.source) navigate(`/admin/sources/${encodeURIComponent(r.source.id)}`);
              }}
            >
              建立
            </Button>
          </div>
        </Card>
        <Card title={preview ? `預覽：${preview.count} 條（${preview.ms}ms）` : "預覽"}>
          {!preview ? (
            <Empty>填好配置後點「預覽抓取」，這裡顯示將會採集到的條目（不入庫）。</Empty>
          ) : preview.items.length ? (
            <ul className="space-y-3">
              {preview.items.map((i) => (
                <li key={i.url} className="text-[13px]">
                  <a href={i.url} target="_blank" rel="noreferrer" className="font-medium text-ink hover:text-accent">{i.title}</a>
                  <div className="text-[12px] text-ink-4">{i.publishedAt ? bj(i.publishedAt, true) : "無發布時間"}</div>
                  {i.excerpt && <div className="mt-0.5 line-clamp-2 text-[12.5px] text-ink-3">{i.excerpt}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>沒有抓到條目。</Empty>
          )}
        </Card>
      </div>
    </AdminPage>
  );
}
