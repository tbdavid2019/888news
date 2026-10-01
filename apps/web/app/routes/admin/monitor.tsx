import { SITE } from "@aihot/industry/site";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/monitor";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { bj } from "../../features/admin/format";
import { AdminPage, Badge, Button, Card, Empty, Field, FilterChips, Input, Json, Pager, ReasonDialog, Select } from "../../features/admin/ui";

interface EventPost {
  postId: string;
  stage: string;
  action: string;
  text: string;
  originalText: string;
  publishedAt: string;
  url: string;
}
interface MonitorEvent {
  id: string;
  type: "direct_reset" | "reset_credit";
  status: "announced" | "confirmed";
  label: string;
  display_label: string;
  scope: string;
  schedule: { precision: string; from: string; through: string; label: string } | null;
  estimate: { label: string; basis: string } | null;
  presentation: Record<string, any> | null;
  confirmed_at: string | null;
  occurred_on: string | null;
  confirmation_basis: string | null;
  withdrawn: boolean;
  created_at: string;
  updated_at: string;
  posts: EventPost[];
}
interface Post {
  id: string;
  published_at: string;
  text: string;
  url: string;
  translation: string | null;
  processed_at: string | null;
  propositions: Array<Record<string, any>> | null;
  needs_review: boolean | null;
  relevant: boolean | null;
  held: Array<{ action: string; excerpt: string }> | null;
  reviewed: boolean | null;
  skipped: boolean | null;
  failures: { count: number; since: string; error?: string } | null;
  links: Array<{ eventId: string; stage: string }>;
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") ?? "events";
  if (tab === "posts") {
    const posts = await adminGet<{ page: number; filter: string; rows: Post[] }>(request, `/api/admin/monitor/posts?filter=${url.searchParams.get("filter") ?? "relevant"}&page=${url.searchParams.get("page") ?? 1}`);
    return { tab, posts, events: null };
  }
  const events = await adminGet<{ events: MonitorEvent[] }>(request, `/api/admin/monitor/events${url.searchParams.get("withdrawn") ? "?withdrawn=1" : ""}`);
  return { tab, posts: null, events };
}

export const meta: Route.MetaFunction = () => [{ title: `Codex 重設 · ${SITE.name} 後台` }];

const toLocal = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 16) : "");
const fromLocal = (v: string) => (v ? `${v}:00+08:00` : null);
const KIND: Record<string, string> = { direct_reset: "額度重設", reset_credit: "重設卡" };

function EventCard({ e, all }: { e: MonitorEvent; all: MonitorEvent[] }) {
  const { run, pending } = useAdminAction();
  const [dialog, setDialog] = useState<null | "edit" | "review" | "withdraw" | "move">(null);
  const [form, setForm] = useState(() => formOf(e));
  const [reviewDay, setReviewDay] = useState(() => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10));
  const [move, setMove] = useState<{ postId: string; to: string } | null>(null);
  const version = new Date(e.updated_at).toISOString();
  const base = `/api/admin/monitor/events/${encodeURIComponent(e.id)}`;
  const p = e.presentation ?? {};
  return (
    <article className={`rounded-panel bg-surface p-4 ring-1 ${e.withdrawn ? "opacity-60 ring-line" : e.status === "confirmed" ? "ring-line" : "ring-accent/30"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={e.type === "reset_credit" ? "info" : "accent"}>{KIND[e.type]}</Badge>
            <Badge tone={e.status === "confirmed" ? "ok" : "warn"}>{e.status === "confirmed" ? "已確認" : p.inProgress ? "發送中" : "已宣佈"}</Badge>
            {e.confirmation_basis === "receipt_review" && <Badge tone="info" title="依據帳戶收據核對確認">收據核對</Badge>}
            {e.withdrawn && <Badge tone="bad">已撤回</Badge>}
            {!p.kindExplicit && <Badge>形式未明確</Badge>}
          </div>
          <div className="mt-2 text-[15px] font-semibold text-ink">{e.schedule?.label ?? (e.estimate ? `${SITE.name} 估計 ${e.estimate.label}` : "未提供時間")}</div>
          <div className="mt-0.5 text-[12.5px] text-ink-3">
            {p.audienceZh ?? e.scope ?? "適用對象未說明"}
            {p.productsZh ? ` · ${p.productsZh}` : ""}
            {e.confirmed_at ? ` · 確認於 ${bj(e.confirmed_at, true)}` : e.occurred_on ? ` · 發生於 ${e.occurred_on}` : ""}
          </div>
          <div className="mt-1 font-mono text-[11.5px] text-ink-4">{e.id} · 更新 {bj(e.updated_at, true)}</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => { setForm(formOf(e)); setDialog("edit"); }}>編輯</Button>
          {e.status !== "confirmed" && <Button size="sm" onClick={() => setDialog("review")}>收據核對確認</Button>}
          <Button size="sm" tone="ghost" onClick={() => setDialog("withdraw")}>{e.withdrawn ? "恢復" : "撤回"}</Button>
        </div>
      </div>
      <ol className="mt-3 space-y-2 border-t border-line pt-3">
        {e.posts.map((post) => (
          <li key={post.postId} className="grid gap-1 text-[13px] sm:grid-cols-[92px_1fr_auto]">
            <div className="flex items-center gap-1.5 sm:block">
              <Badge tone={post.action === "confirm" ? "ok" : "muted"}>{post.stage}</Badge>
              <div className="num text-[11.5px] text-ink-4 sm:mt-1">{bj(post.publishedAt)}</div>
            </div>
            <div className="min-w-0">
              <div className="text-ink">{post.text}</div>
              <a className="text-[12px] text-ink-4 hover:text-accent" href={post.url} target="_blank" rel="noreferrer">{post.originalText}</a>
            </div>
            <Button size="sm" tone="ghost" onClick={() => { setMove({ postId: post.postId, to: "" }); setDialog("move"); }}>移动</Button>
          </li>
        ))}
      </ol>

      <ReasonDialog
        open={dialog === "edit"}
        title="编辑事件"
        description="时间按北京时间填写；改动立即反映在重置页、v1 接口和版本探针上。"
        confirmLabel="保存"
        busy={pending === "edit"}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => {
          const patch: Record<string, unknown> = {
            type: form.type,
            status: form.status,
            audienceZh: form.audienceZh || null,
            productsZh: form.productsZh || null,
            scopeLabel: form.scopeLabel || null,
            schedule: form.precision ? { precision: form.precision, from: fromLocal(form.from), through: fromLocal(form.through || form.from) } : null,
          };
          if (form.status === "confirmed") patch.confirmedAt = fromLocal(form.confirmedAt);
          return (await run("PATCH", base, { patch, reason, version }, { label: "edit", success: "事件已更新" })) !== null;
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="类型">
            <Select value={form.type} onChange={(ev) => setForm({ ...form, type: ev.target.value as MonitorEvent["type"] })}>
              <option value="direct_reset">额度重置</option>
              <option value="reset_credit">重置卡</option>
            </Select>
          </Field>
          <Field label="状态">
            <Select value={form.status} onChange={(ev) => setForm({ ...form, status: ev.target.value as MonitorEvent["status"] })}>
              <option value="announced">已宣布</option>
              <option value="confirmed">已确认</option>
            </Select>
          </Field>
          <Field label="时间精度">
            <Select value={form.precision} onChange={(ev) => setForm({ ...form, precision: ev.target.value })}>
              <option value="">没有时间</option>
              <option value="window">时间段</option>
              <option value="deadline">截止时间（…前）</option>
              <option value="approximate">大约</option>
              <option value="date">整天</option>
            </Select>
          </Field>
          {form.status === "confirmed" && (
            <Field label="确认时间">
              <Input type="datetime-local" value={form.confirmedAt} onChange={(ev) => setForm({ ...form, confirmedAt: ev.target.value })} />
            </Field>
          )}
          {form.precision && (
            <>
              <Field label="从"><Input type="datetime-local" value={form.from} onChange={(ev) => setForm({ ...form, from: ev.target.value })} /></Field>
              {(form.precision === "window" || form.precision === "date") && <Field label="到"><Input type="datetime-local" value={form.through} onChange={(ev) => setForm({ ...form, through: ev.target.value })} /></Field>}
            </>
          )}
          <Field label="适用对象（中文）"><Input value={form.audienceZh} onChange={(ev) => setForm({ ...form, audienceZh: ev.target.value })} /></Field>
          <Field label="产品"><Input value={form.productsZh} onChange={(ev) => setForm({ ...form, productsZh: ev.target.value })} /></Field>
          <Field label="范围标签（原文）"><Input value={form.scopeLabel} onChange={(ev) => setForm({ ...form, scopeLabel: ev.target.value })} /></Field>
        </div>
      </ReasonDialog>
      <ReasonDialog
        open={dialog === "review"}
        title="依據收據核對確認"
        description="官方尚未發布「已完成」，但帳戶中已觀察到重設或重設卡（讀者截圖或自有帳號）。若知曉生效日請填寫日期，不確定則留空；不發送推播通知。官方補發確認貼文時，來源會自動改為官方確認，此筆核對記錄將予保留。"
        confirmLabel="確認"
        busy={pending === "review"}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => (await run("POST", `${base}/receipt-review`, { occurredOn: reviewDay || null, reason, version }, { label: "review", success: "已確認" })) !== null}
      >
        <Field label="生效日（不確定請留空）"><Input type="date" value={reviewDay} onChange={(ev) => setReviewDay(ev.target.value)} /></Field>
      </ReasonDialog>
      <ReasonDialog
        open={dialog === "withdraw"}
        title={e.withdrawn ? "恢復事件" : "撤回事件"}
        description={e.withdrawn ? "恢復後將重新顯示於重設頁面和 API 接口。" : "撤回後不再出現於重設頁面和 API 接口（識別錯誤、重複事件）。"}
        danger={!e.withdrawn}
        confirmLabel={e.withdrawn ? "恢復" : "撤回"}
        busy={pending === "withdraw"}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => (await run("POST", `${base}/withdrawn`, { withdrawn: !e.withdrawn, reason, version }, { label: "withdraw", success: e.withdrawn ? "已恢復" : "已撤回" })) !== null}
      />
      <ReasonDialog
        open={dialog === "move"}
        title="移動貼文"
        description="將此貼文連結至另一個事件，或從事件中移除。"
        confirmLabel="移動"
        busy={pending === "move"}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) =>
          (await run("POST", "/api/admin/monitor/relink", { postId: move!.postId, fromEventId: e.id, toEventId: move!.to || null, reason }, { label: "move", success: "貼文已移動" })) !== null
        }
      >
        <Field label="目標事件">
          <Select value={move?.to ?? ""} onChange={(ev) => setMove({ ...move!, to: ev.target.value })}>
            <option value="">移出（不屬於任何事件）</option>
            {all.filter((x) => x.id !== e.id).slice(0, 60).map((x) => (
              <option key={x.id} value={x.id}>{bj(x.created_at)} · {KIND[x.type]} · {x.schedule?.label ?? x.id}</option>
            ))}
          </Select>
        </Field>
      </ReasonDialog>
    </article>
  );
}

function formOf(e: MonitorEvent) {
  const p = e.presentation ?? {};
  return {
    type: e.type,
    status: e.status,
    precision: e.schedule?.precision === "exact" ? "window" : e.schedule?.precision ?? "",
    from: toLocal(e.schedule?.from),
    through: toLocal(e.schedule?.through),
    confirmedAt: toLocal(e.confirmed_at),
    audienceZh: String(p.audienceZh ?? ""),
    productsZh: String(p.productsZh ?? ""),
    scopeLabel: String(p.scopeLabel ?? ""),
  };
}

function PostRow({ post }: { post: Post }) {
  const props = post.propositions ?? [];
  const { run, pending } = useAdminAction();
  const [dialog, setDialog] = useState<null | "skip" | "reviewed">(null);
  const resolve = async (action: "skip" | "reviewed", reason: string) =>
    (await run("POST", `/api/admin/monitor/posts/${post.id}/resolve`, { action, reason }, { label: action, success: action === "skip" ? "已跳过" : "已标记为核实" })) !== null;
  return (
    <article className="rounded-panel bg-surface p-4 ring-1 ring-line">
      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3">
        <a href={post.url} target="_blank" rel="noreferrer" className="num hover:text-accent">{bj(post.published_at, true)}</a>
        {post.skipped ? <Badge>已跳过</Badge> : post.relevant ? <Badge tone="accent">相关</Badge> : post.processed_at ? <Badge>无关</Badge> : <Badge tone="warn">待识别</Badge>}
        {post.needs_review && !post.reviewed && <Badge tone="bad">需要复核</Badge>}
        {post.reviewed && <Badge tone="ok">已核实</Badge>}
        {post.failures && <Badge tone="bad" title={post.failures.error}>识别失败 {post.failures.count} 次</Badge>}
        {post.links.map((l) => <Badge key={l.eventId} tone="info" title={l.eventId}>{l.stage}</Badge>)}
        <span className="ml-auto flex gap-1.5">
          {!post.processed_at && <Button size="sm" onClick={() => setDialog("skip")}>跳过</Button>}
          {post.needs_review && !post.reviewed && post.processed_at && <Button size="sm" onClick={() => setDialog("reviewed")}>标记已核实</Button>}
        </span>
      </div>
      {post.held && post.held.length > 0 && (
        <div className="mt-2 rounded-control bg-bg-sunk px-3 py-2 text-[12.5px] text-ink-3">
          <div className="font-medium text-ink-2">没有自动生效的识别（引文不在原帖里，或对“已完成”没有把握）</div>
          {post.held.map((h, i) => <div key={i}>{h.action} · “{h.excerpt}”</div>)}
        </div>
      )}
      <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{post.translation ?? post.text}</p>
      {post.translation && <p className="mt-1 whitespace-pre-wrap text-[12.5px] text-ink-4">{post.text}</p>}
      {props.length > 0 && (
        <div className="mt-2 space-y-1">
          {props.map((p, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <Badge tone={p.real ? "ok" : "muted"}>{p.real ? "真实" : "非承诺"}</Badge>
              <Badge>{KIND[p.kind] ?? p.kind} · {p.action}</Badge>
              {p.relatesTo && <span className="font-mono text-ink-4">→ {p.relatesTo}</span>}
              <span className="text-ink-3">{p.excerptZh ?? p.excerpt}</span>
            </div>
          ))}
          <Json value={props} label="识别结果" />
        </div>
      )}
      <ReasonDialog
        open={dialog === "skip"}
        title="略過此貼文"
        description="貼文按順序識別，此筆持續失敗將阻擋後續所有貼文。略過後將不再進行識別、不產生事件；若確有重設內容請至「事件」中手動處理。"
        danger
        confirmLabel="略過"
        busy={pending === "skip"}
        onClose={() => setDialog(null)}
        onSubmit={(reason) => resolve("skip", reason)}
      />
      <ReasonDialog
        open={dialog === "reviewed"}
        title="標記為已核實"
        description="已按原貼文處理完畢（修改或確認了事件，或確認無須處理）。標記後將離開複核清單，告警亦會停止。"
        confirmLabel="標記"
        busy={pending === "reviewed"}
        onClose={() => setDialog(null)}
        onSubmit={(reason) => resolve("reviewed", reason)}
      />
    </article>
  );
}

export default function MonitorAdmin({ loaderData }: Route.ComponentProps) {
  const [sp] = useSearchParams();
  const tab = loaderData.tab;
  return (
    <AdminPage
      title="Codex 重設"
      subtitle="修正識別結果：事件類型、狀態、時間與適用對象；無「已完成」貼文時以收據核對確認；識別錯誤之事件可撤回；貼文關聯錯誤可移動。"
      actions={<a className="text-[13px] text-accent" href="/codex-reset" target="_blank" rel="noreferrer">開啟公開頁</a>}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          <Link to="?tab=events" className={`rounded-full px-3.5 py-1.5 text-[13px] ${tab === "events" ? "bg-ink text-bg" : "bg-surface text-ink-2 ring-1 ring-line"}`}>事件</Link>
          <Link to="?tab=posts" className={`rounded-full px-3.5 py-1.5 text-[13px] ${tab === "posts" ? "bg-ink text-bg" : "bg-surface text-ink-2 ring-1 ring-line"}`}>貼文與識別</Link>
        </div>
        {tab === "events" ? (
          <Link to={sp.get("withdrawn") ? "?tab=events" : "?tab=events&withdrawn=1"} className="text-[12.5px] text-ink-3 hover:text-ink">{sp.get("withdrawn") ? "隱藏已撤回" : "包含已撤回"}</Link>
        ) : (
          <FilterChips param="filter" options={[{ value: "relevant", label: "相關" }, { value: "review", label: "需複核" }, { value: "pending", label: "待識別" }, { value: "all", label: "全部" }]} />
        )}
      </div>
      {loaderData.events && (
        <div className="space-y-3">
          {loaderData.events.events.length ? loaderData.events.events.map((e) => <EventCard key={`${e.id}-${e.updated_at}`} e={e} all={loaderData.events!.events} />) : <Card><Empty>沒有事件</Empty></Card>}
        </div>
      )}
      {loaderData.posts && (
        <>
          <div className="space-y-3">{loaderData.posts.rows.length ? loaderData.posts.rows.map((p) => <PostRow key={p.id} post={p} />) : <Card><Empty>沒有符合條件的貼文</Empty></Card>}</div>
          <Pager page={loaderData.posts.page} hasMore={loaderData.posts.rows.length === 50} />
        </>
      )}
    </AdminPage>
  );
}
