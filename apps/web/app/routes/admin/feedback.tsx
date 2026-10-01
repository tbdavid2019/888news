import { SITE } from "@aihot/industry/site";
import { useState } from "react";
import { Form, useSearchParams } from "react-router";
import type { Route } from "./+types/feedback";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { bj } from "../../features/admin/format";
import { FEEDBACK_STATUS } from "../../features/admin/labels";
import { AdminPage, Badge, Button, Card, Empty, FilterChips, Input, Pager, ReasonDialog, Select, Textarea, Time } from "../../features/admin/ui";

interface Feedback {
  id: number;
  content: string;
  email: string | null;
  page_url: string | null;
  /** local (viewable here until forwarded), feishu (in the internal chat), gone (could not be forwarded), or null. */
  screenshot: "local" | "feishu" | "gone" | null;
  source_hash: string;
  status: string;
  note: string | null;
  forwarded_at: string | null;
  forward_error: string | null;
  created_at: string;
  updated_at: string;
  banned: boolean;
  from_source: number;
}

interface Data {
  page: number;
  rows: Feedback[];
  counts: Record<string, number>;
  bans: Array<{ source_hash: string; reason: string | null; created_by: string | null; created_at: string }>;
}

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<Data>(request, `/api/admin/feedback${new URL(request.url).search}`);
}

export const meta: Route.MetaFunction = () => [{ title: `意見反饋 · ${SITE.name} 後台` }];

const TONE: Record<string, "accent" | "warn" | "ok" | "muted"> = { new: "accent", triaged: "warn", replied: "ok", resolved: "ok", spam: "muted" };

function FeedbackCard({ f }: { f: Feedback }) {
  const { run, pending } = useAdminAction();
  const [note, setNote] = useState(f.note ?? "");
  const [dialog, setDialog] = useState<null | "ban" | "erase">(null);
  const base = `/api/admin/feedback/${f.id}`;
  const version = new Date(f.updated_at).toISOString();
  return (
    <article className="rounded-panel bg-surface p-4 ring-1 ring-line">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
        <span className="num font-medium text-ink-2">#{f.id}</span>
        <Badge tone={TONE[f.status] ?? "muted"}>{FEEDBACK_STATUS[f.status] ?? f.status}</Badge>
        <Time at={f.created_at} />
        {f.email && <a className="text-accent" href={`mailto:${f.email}`}>{f.email}</a>}
        {f.page_url && <a className="max-w-[320px] truncate hover:text-accent" href={f.page_url} target="_blank" rel="noreferrer">{f.page_url}</a>}
        {f.from_source > 1 && <Badge tone="info" title="同一來源（IP 與瀏覽器家族的不可逆標識）">同來源 {f.from_source} 條</Badge>}
        {f.banned && <Badge tone="bad">來源已封鎖</Badge>}
        {!f.forwarded_at && f.status === "new" && (
          <Badge tone="warn" title={f.forward_error && f.forward_error !== "pending" ? `尚未轉發到推播頻道：${f.forward_error}` : "尚未轉發到推播頻道"}>未轉發</Badge>
        )}
      </div>
      <p className="mt-2.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{f.content}</p>
      {f.screenshot === "local" && (
        <a href={`${base}/screenshot`} target="_blank" rel="noreferrer" className="mt-2 inline-block">
          <img src={`${base}/screenshot`} alt="反饋截圖" loading="lazy" className="max-h-48 rounded-control ring-1 ring-line" />
        </a>
      )}
      {f.screenshot === "feishu" && <p className="mt-2 text-[12.5px] text-ink-4">截圖已隨反饋轉到推播頻道。</p>}
      {f.screenshot === "gone" && <p className="mt-2 text-[12.5px] text-ink-4">截圖未能轉發，已刪除。</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-start">
        <Select
          aria-label="處理狀態"
          value={f.status}
          disabled={!!pending}
          onChange={(e) => run("PATCH", base, { status: e.target.value, version }, { label: "status", success: "狀態已更新" })}
        >
          {Object.entries(FEEDBACK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Textarea rows={1} className="!min-h-[38px]" placeholder="處理備註（僅內部可見）" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex gap-1.5">
          <Button size="md" disabled={note === (f.note ?? "")} busy={pending === "note"} onClick={() => run("PATCH", base, { note: note || null, version }, { label: "note", success: "備註已儲存" })}>
            儲存備註
          </Button>
          <Button tone="ghost" onClick={() => setDialog(f.banned ? null : "ban")} disabled={f.banned} title="拒絕此來源的後續反饋">封鎖來源</Button>
          <Button tone="ghost" onClick={() => setDialog("erase")} title="按隱私說明刪除提交者的資料">刪除資料</Button>
        </div>
      </div>
      <ReasonDialog
        open={dialog === "ban"}
        title="封鎖此反饋來源"
        description="同一來源之後提交反饋會被拒絕。來源標識不可還原成 IP。"
        danger
        confirmLabel="封鎖"
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => (await run("POST", "/api/admin/feedback-bans", { sourceHash: f.source_hash, reason }, { label: "ban", success: "已封鎖" })) !== null}
      />
      <ReasonDialog
        open={dialog === "erase"}
        title="刪除提交者資料"
        description="刪除內文、信箱、頁面網址和截圖，只保留處理記錄。不可復原。"
        danger
        confirmLabel="刪除"
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => (await run("POST", `${base}/erase`, { reason }, { label: "erase", success: "資料已刪除" })) !== null}
      />
    </article>
  );
}

export default function FeedbackAdmin({ loaderData }: Route.ComponentProps) {
  const { rows, counts, bans, page } = loaderData;
  const [sp] = useSearchParams();
  const { run } = useAdminAction();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <AdminPage title="意見反饋" subtitle="回覆經由郵件或推播發送，收件人、主題、正文確認後再發送；「已修復上線」需有生產環境驗證。">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips
          param="status"
          options={[{ value: "", label: "全部", count: total }, ...Object.entries(FEEDBACK_STATUS).map(([k, v]) => ({ value: k, label: v, count: counts[k] ?? 0 }))]}
        />
        <Form method="get" className="w-full max-w-xs">
          {sp.get("status") && <input type="hidden" name="status" value={sp.get("status")!} />}
          <Input name="q" defaultValue={sp.get("q") ?? ""} placeholder="搜尋內容、信箱、頁面" aria-label="搜尋反饋" />
        </Form>
      </div>
      <div className="space-y-3">
        {rows.length ? rows.map((f) => <FeedbackCard key={`${f.id}-${f.updated_at}`} f={f} />) : <Card><Empty>沒有符合條件的反饋</Empty></Card>}
      </div>
      <Pager page={page} hasMore={rows.length === 50} />
      {bans.length > 0 && (
        <Card className="mt-8" title="已封鎖的來源">
          <ul className="space-y-2 text-[13px]">
            {bans.map((b) => (
              <li key={b.source_hash} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-mono text-[12px] text-ink-3">{b.source_hash}</span> · {b.reason} · {b.created_by} · {bj(b.created_at, true)}
                </span>
                <Button size="sm" tone="ghost" onClick={() => run("DELETE", `/api/admin/feedback-bans/${encodeURIComponent(b.source_hash)}`, undefined, { label: `unban-${b.source_hash}`, success: "已解除封鎖" })}>
                  解除
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </AdminPage>
  );
}
