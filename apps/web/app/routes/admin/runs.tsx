import { SITE } from "@aihot/industry/site";
import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { useEffect } from "react";
import type { Route } from "./+types/runs";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { ago, bj, duration, num } from "../../features/admin/format";
import { AdminPage, Badge, Button, Card, DataTable, Dot, Empty, Field, Json, ReasonDialog, Select, Stat, Time } from "../../features/admin/ui";

type Row = Record<string, any>;
interface Runs {
  checkedAt: string;
  processes: Array<{ role: string; pid: number; host: string; release: string; startedAt: string; at: string; alive: boolean }>;
  jobs: Row[];
  timeline: Row[];
  queues: Array<{ name: string; state: string; n: number; oldest: string }>;
  failedJobs: Row[];
  lagging: Row[];
  receipts: { counts: Record<string, number>; issues: Row[] };
  deliveries: Row[];
  errors: Row[];
  retrying: { count: number; next: string | null };
  ingest: Row[];
  leaderboard: { at: string; sources: Array<{ key: string; ok: boolean; at: string; lastOkAt: string | null; changed?: boolean; rows?: number; error?: string }> } | null;
}


export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<Runs>(request, "/api/admin/runs");
}

export const meta: Route.MetaFunction = () => [{ title: `執行狀態 · ${SITE.name} 後台` }];

const STATE_LABEL: Record<string, string> = { created: "排隊", retry: "等待重試", active: "執行中" };

export default function RunsAdmin({ loaderData }: Route.ComponentProps) {
  const refresh = useFetcher<typeof loader>();
  const r = refresh.data ?? loaderData;
  const { run, pending } = useAdminAction();
  const [receipt, setReceipt] = useState<Row | null>(null);
  const [billed, setBilled] = useState("false");
  const [delivery, setDelivery] = useState<Row | null>(null);
  const [outcome, setOutcome] = useState<"sent" | "drop" | "resend">("sent");
  // Failure group to put back into processing ("" = every failure of the last 30 days).
  const [requeue, setRequeue] = useState<string | null>(null);

  // Live view: refresh every 20 s while visible.
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && refresh.state === "idle" && refresh.load("/admin/runs"), 20_000);
    return () => clearInterval(t);
  }, [refresh]);

  const backlog = new Map<string, Record<string, { n: number; oldest: string }>>();
  for (const q of r.queues) backlog.set(q.name, { ...(backlog.get(q.name) ?? {}), [q.state]: { n: q.n, oldest: q.oldest } });
  const queued = r.queues.filter((q) => q.state !== "active").reduce((a, q) => a + q.n, 0);
  const worker = r.processes.find((p) => p.role === "worker");
  const failing = r.jobs.filter((j) => j.status === "failed");

  return (
    <AdminPage title="執行狀態" subtitle={<>任務、佇列、信源延遲與需要人工核對的收據和投遞。每 20 秒自動重新整理 · 最近檢查 {bj(r.checkedAt)}</>}>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          label="worker"
          value={<span className="inline-flex items-center gap-2 text-[18px]"><Dot tone={worker?.alive ? "ok" : "bad"} />{worker ? (worker.alive ? "運作中" : "心跳中斷") : "無心跳"}</span>}
          hint={worker ? `${worker.host} · 心跳 ${ago(worker.at)}` : "worker 未回報心跳"}
        />
        <Stat label="佇列積壓" value={num(queued)} tone={queued > 500 ? "warn" : undefined} hint="排隊與等待重試" />
        <Stat label="失敗的排程任務" value={num(failing.length)} tone={failing.length ? "bad" : "ok"} hint="最近一次執行失敗" />
        <Stat label="收據結果未知" value={num(r.receipts.issues.filter((x) => x.status === "unknown").length)} tone={r.receipts.issues.some((x) => x.status === "unknown") ? "bad" : "ok"} hint={`7 天 ${num(Object.values(r.receipts.counts).reduce((a, b) => a + b, 0))} 次付費請求`} />
        <Stat label="投遞待核實" value={num(r.deliveries.filter((d) => d.status === "unknown").length)} tone={r.deliveries.some((d) => d.status === "unknown") ? "bad" : "ok"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="佇列" pad={false}>
          <DataTable
            dense
            rows={[...backlog.entries()]}
            rowKey={([name]) => name}
            empty="佇列是空的"
            columns={[
              { key: "n", label: "佇列", render: ([name]) => <span className="font-mono text-[12.5px]">{name}</span> },
              ...(["created", "retry", "active"] as const).map((st) => ({
                key: st,
                label: STATE_LABEL[st],
                align: "right" as const,
                render: ([, v]: [string, Record<string, { n: number; oldest: string }>]) => (v[st] ? <span title={`最早 ${bj(v[st]!.oldest, true)}`}>{num(v[st]!.n)}</span> : <span className="text-ink-4">0</span>),
              })),
              { key: "old", label: "最早排隊", render: ([, v]) => <Time at={v.created?.oldest ?? v.retry?.oldest ?? null} /> },
            ]}
          />
        </Card>
        <Card title="排程任務" pad={false}>
          <DataTable
            dense
            rows={r.jobs}
            rowKey={(j) => j.job}
            columns={[
              { key: "j", label: "任務", render: (j) => <span className="font-mono text-[12.5px]">{j.job}</span> },
              { key: "s", label: "上次", render: (j) => <Badge tone={j.status === "ok" ? "ok" : j.status === "failed" ? "bad" : "muted"} title={j.error ?? undefined}>{j.status ?? "運作中"}</Badge> },
              { key: "at", label: "時間", render: (j) => <Time at={j.started_at} /> },
              { key: "d", label: "耗時", align: "right", render: (j) => duration(j.started_at, j.finished_at) },
              { key: "f", label: "24h 失敗", align: "right", render: (j) => (j.failed_24h ? <span className="text-hot">{j.failed_24h}/{j.runs_24h}</span> : `0/${j.runs_24h}`) },
            ]}
          />
        </Card>
      </div>

      {r.failedJobs.length > 0 && (
        <Card className="mt-5" title="24 小時內失敗的佇列任務" pad={false}>
          <DataTable
            dense
            rows={r.failedJobs}
            rowKey={(j) => j.name}
            columns={[
              { key: "n", label: "佇列", render: (j) => <span className="font-mono text-[12.5px]">{j.name}</span> },
              { key: "c", label: "失敗", align: "right", render: (j) => num(j.failed) },
              { key: "l", label: "最近", render: (j) => <Time at={j.last} /> },
              { key: "o", label: "最近錯誤", render: (j) => <span className="line-clamp-2 font-mono text-[11.5px] text-ink-3">{j.last_output}</span> },
            ]}
          />
        </Card>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="需要核對的付費收據" right={<span>{Object.entries(r.receipts.counts).map(([k, v]) => `${k} ${v}`).join(" · ")}</span>} pad={false}>
          <DataTable
            dense
            rows={r.receipts.issues}
            rowKey={(x) => x.id}
            empty="沒有待處理的收據"
            columns={[
              { key: "id", label: "收據", render: (x) => <span className="num">#{x.id}</span> },
              { key: "s", label: "狀態", render: (x) => <Badge tone={x.status === "unknown" ? "bad" : "warn"}>{x.status}</Badge> },
              { key: "w", label: "服務", render: (x) => <span className="whitespace-nowrap">{x.service}{x.model ? ` · ${x.model}` : ""}</span> },
              { key: "p", label: "用途", render: (x) => (x.subject && /^[\w-]{10,}$/.test(x.subject) && x.purpose.includes("analy") ? <Link className="text-accent" to={`/admin/content/${x.subject}`}>{x.purpose}</Link> : x.purpose) },
              { key: "e", label: "錯誤", render: (x) => <span className="line-clamp-2 text-[12px] text-ink-3" title={x.error ?? ""}>{x.error}</span> },
              { key: "a", label: "", render: (x) => (x.status === "unknown" ? <Button size="sm" onClick={() => setReceipt(x)}>核對</Button> : null) },
            ]}
          />
        </Card>
        <Card title="需要核實的投遞" pad={false}>
          <DataTable
            dense
            rows={r.deliveries}
            rowKey={(d) => d.id}
            empty="沒有待核實的投遞"
            columns={[
              { key: "t", label: "目標", render: (d) => d.target_key },
              { key: "s", label: "狀態", render: (d) => <Badge tone={d.status === "unknown" ? "bad" : "warn"}>{d.status}</Badge> },
              { key: "sub", label: "內容", render: (d) => (d.subject_kind === "selected" ? <Link className="text-accent" to={`/admin/content/${d.subject_id}`}>{d.subject_id}</Link> : `${d.subject_kind} ${d.subject_id}`) },
              { key: "at", label: "時間", render: (d) => <Time at={d.updated_at} /> },
              { key: "a", label: "", render: (d) => <Button size="sm" onClick={() => setDelivery(d)}>處理</Button> },
            ]}
          />
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="延遲或失敗的信源" right={<Link className="text-accent" to="/admin/sources?health=failing">全部失敗信源</Link>} pad={false}>
          <DataTable
            dense
            rows={r.lagging}
            rowKey={(s) => s.id}
            empty="信源都按時採集"
            columns={[
              { key: "n", label: "信源", render: (s) => <Link className="text-ink hover:text-accent" to={`/admin/sources/${encodeURIComponent(s.id)}`}>{s.name}</Link> },
              { key: "h", label: "健康", render: (s) => <Badge tone={s.health === "failing" ? "bad" : s.health === "degraded" ? "warn" : "muted"}>{s.health}</Badge> },
              { key: "ok", label: "上次成功", render: (s) => <Time at={s.last_ok_at} /> },
              { key: "nx", label: "應抓", render: (s) => <Time at={s.next_fetch_at} /> },
              { key: "e", label: "錯誤", render: (s) => <span className="line-clamp-1 text-[12px] text-ink-3" title={s.last_error ?? ""}>{s.last_error}</span> },
            ]}
          />
        </Card>
        <Card
          title="處理失敗（30 天，按錯誤歸類）"
          right={
            <span className="flex items-center gap-3">
              {r.retrying.count > 0 && <span>等待重試 {num(r.retrying.count)} 條 · 下一次 <Time at={r.retrying.next} /></span>}
              {r.errors.length > 0 && <Button size="sm" onClick={() => setRequeue("")}>全部重新處理</Button>}
            </span>
          }
          pad={false}
        >
          <DataTable
            dense
            rows={r.errors}
            rowKey={(e) => e.error}
            empty="沒有處理失敗"
            columns={[
              { key: "e", label: "錯誤", render: (e) => <span className="font-mono text-[11.5px] text-ink-2">{e.error}</span> },
              { key: "n", label: "條數", align: "right", render: (e) => num(e.n) },
              { key: "x", label: "範例", render: (e) => <Link className="text-accent" to={`/admin/content/${e.example}`}>檢視</Link> },
              { key: "l", label: "最近", render: (e) => <Time at={e.last} /> },
              { key: "a", label: "", align: "right", render: (e) => <Button size="sm" onClick={() => setRequeue(e.error)}>重新處理</Button> },
            ]}
          />
        </Card>
      </div>

      {r.leaderboard && (
        <Card
          className="mt-5"
          title="模型榜評測來源"
          right={<span>最近抓取 {bj(r.leaderboard.at)} · 成功 {r.leaderboard.sources.filter((x) => x.ok).length}/{r.leaderboard.sources.length}</span>}
          pad={false}
        >
          <div className="max-h-[360px] overflow-y-auto">
            <DataTable
              dense
              rows={r.leaderboard.sources}
              rowKey={(x) => x.key}
              columns={[
                { key: "k", label: "來源", render: (x) => <span className="font-mono text-[12.5px]">{x.key}</span> },
                { key: "s", label: "上次抓取", render: (x) => <Badge tone={x.ok ? "ok" : "bad"}>{x.ok ? (x.changed ? "有更新" : "無變化") : "失敗"}</Badge> },
                { key: "ok", label: "上次成功", render: (x) => <Time at={x.lastOkAt} /> },
                { key: "n", label: "行數", align: "right", render: (x) => (x.rows == null ? "—" : num(x.rows)) },
                { key: "e", label: "錯誤", render: (x) => <span className="line-clamp-1 text-[12px] text-ink-3" title={x.error ?? ""}>{x.error}</span> },
              ]}
            />
          </div>
        </Card>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="任務時間線" pad={false}>
          <div className="max-h-[420px] overflow-y-auto">
            <DataTable
              dense
              rows={r.timeline}
              rowKey={(t) => t.id}
              columns={[
                { key: "at", label: "開始", render: (t) => <span className="num whitespace-nowrap">{bj(t.started_at)}</span> },
                { key: "j", label: "任務", render: (t) => <span className="font-mono text-[12px]">{t.job}</span> },
                { key: "s", label: "結果", render: (t) => <Badge tone={t.status === "ok" ? "ok" : t.status === "failed" ? "bad" : "muted"} title={t.error ?? undefined}>{t.status ?? "運作中"}</Badge> },
                { key: "d", label: "耗時", align: "right", render: (t) => duration(t.started_at, t.finished_at) },
              ]}
            />
          </div>
        </Card>
        <Card title="外部回報" pad={false}>
          {r.ingest.length ? (
            <DataTable
              dense
              rows={r.ingest}
              rowKey={(e) => `${e.client}-${e.created_at}`}
              columns={[
                { key: "at", label: "時間", render: (e) => <Time at={e.created_at} /> },
                { key: "c", label: "用戶端", render: (e) => e.client },
                { key: "k", label: "類型", render: (e) => e.kind },
                { key: "s", label: "結果", render: (e) => <Badge tone={e.status === "ok" ? "ok" : e.status === "error" ? "bad" : "muted"} title={e.error ?? undefined}>{e.status}</Badge> },
                { key: "x", label: "摘要", render: (e) => <Json value={e.summary} label="摘要" /> },
              ]}
            />
          ) : (
            <Empty>尚未有外部回報（公眾號截圖監控、採集腳本）</Empty>
          )}
        </Card>
      </div>

      {r.processes.length > 0 && (
        <Card className="mt-5" title="處理程序">
          <ul className="grid gap-2 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
            {r.processes.map((p) => (
              <li key={p.role} className="flex items-center gap-2">
                <Dot tone={p.alive ? "ok" : "bad"} />
                <span className="font-medium">{p.role}</span>
                <span className="text-ink-3">{p.host} · pid {p.pid} · {p.release} · 啟動於 {bj(p.startedAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ReasonDialog
        open={!!receipt}
        title={`核對收據 #${receipt?.id ?? ""}`}
        description="結果未知的請求不會自動重發。請先至服務商控制台確認此次請求是否有計費，再放行：放行後下一次處理會重新發起調用。"
        confirmLabel="記錄並放行"
        busy={pending === "release"}
        onClose={() => setReceipt(null)}
        onSubmit={async (note) => (await run("POST", `/api/admin/receipts/${receipt!.id}/release`, { billed: billed === "true", note }, { label: "release", success: "已放行" })) !== null}
      >
        <Field label="服務商是否計費">
          <Select value={billed} onChange={(e) => setBilled(e.target.value)}>
            <option value="false">未計費（請求未被接受）</option>
            <option value="true">已計費（結果未取回）</option>
          </Select>
        </Field>
      </ReasonDialog>
      <ReasonDialog
        open={requeue !== null}
        title={requeue ? "重新處理此類失敗" : "重新處理全部失敗"}
        description="這些文章會重新進入處理佇列（內文、判斷、發布）。模型調用會重新計費；服務商拒絕的內容可能再次失敗。"
        confirmLabel="重新處理"
        busy={pending === "requeue"}
        onClose={() => setRequeue(null)}
        onSubmit={async (reason) => (await run("POST", "/api/admin/processing/requeue", { group: requeue || null, reason }, { label: "requeue", success: "已重新排隊" })) !== null}
      />
      <ReasonDialog
        open={!!delivery}
        title="處理投遞"
        description="請先至對應群組或頻道確認有無收到。確認沒收到再重發；開發環境不會真的送出。"
        confirmLabel="確認"
        danger={outcome === "resend"}
        busy={pending === "delivery"}
        onClose={() => setDelivery(null)}
        onSubmit={async (note) => (await run("POST", `/api/admin/deliveries/${delivery!.id}/resolve`, { outcome, note }, { label: "delivery", success: "已處理" })) !== null}
      >
        <Field label="結果">
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
            <option value="sent">群組已收到，標記為已送達</option>
            <option value="drop">不再發送</option>
            <option value="resend">群組未收到，重新發送</option>
          </Select>
        </Field>
      </ReasonDialog>
    </AdminPage>
  );
}
