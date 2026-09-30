import { SITE } from "@aihot/industry/site";
import { useRef, useState } from "react";
import type { Route } from "./+types/settings";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { bj, num } from "../../features/admin/format";
import { AdminPage, Badge, Button, Card, DataTable, Field, Input, ReasonDialog } from "../../features/admin/ui";
import { toast } from "../../features/admin/toast";

export interface WebhookChannelInfo {
  configured: boolean;
  source: "env" | "db" | "none";
  valueMasked: string | null;
  extraMasked?: string | null;
}

export interface WebhooksSettings {
  slack: WebhookChannelInfo;
  discord: WebhookChannelInfo;
  telegram: WebhookChannelInfo;
}

interface Settings {
  contact: { wechatQr: string; feishuQr: string };
  targets: Array<{ key: string; purpose: string; kind: string; enabled: boolean; enabled_at: string | null; config_ref: string | null; note: string | null; deliveries_7d: number; last_sent_at: string | null }>;
  budgets: Array<{ service: string; per_minute: number; per_hour: number; per_day: number; note: string | null; updated_at: string; used_day: number; used_hour: number }>;
  webhooks?: WebhooksSettings;
}

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<Settings>(request, "/api/admin/settings");
}

export const meta: Route.MetaFunction = () => [{ title: `设置 · ${SITE.name} 后台` }];

function WebhooksCard({ webhooks }: { webhooks?: WebhooksSettings }) {
  const { run, pending } = useAdminAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    slackWebhookUrl: "",
    discordWebhookUrl: "",
    telegramBotToken: "",
    telegramChatId: "",
  });

  const handleTest = async (channel: "slack" | "discord" | "telegram", name: string) => {
    const res = await run<{ ok: boolean; error?: string }>(
      "POST",
      "/api/admin/settings/webhooks/test",
      { channel },
      { label: `test-${channel}`, revalidate: false }
    );
    if (res?.ok) {
      toast(`${name} 測試通知已成功送出！請至對應頻道確認。`, "ok");
    } else if (res?.error) {
      toast(`${name} 測試發送失敗：${res.error}`, "error");
    }
  };

  const channels = [
    {
      id: "slack" as const,
      name: "Slack",
      info: webhooks?.slack,
      desc: webhooks?.slack?.valueMasked || "未設置 Incoming Webhook URL",
      placeholder: webhooks?.slack?.valueMasked ?? "https://hooks.slack.com/services/...",
    },
    {
      id: "discord" as const,
      name: "Discord",
      info: webhooks?.discord,
      desc: webhooks?.discord?.valueMasked || "未設置 Webhook URL",
      placeholder: webhooks?.discord?.valueMasked ?? "https://discord.com/api/webhooks/...",
    },
    {
      id: "telegram" as const,
      name: "Telegram",
      info: webhooks?.telegram,
      desc: webhooks?.telegram?.valueMasked
        ? `Bot Token: ${webhooks.telegram.valueMasked} · Chat ID: ${webhooks.telegram.extraMasked || "未設置"}`
        : "未設置 Bot Token / Chat ID",
    },
  ];

  return (
    <Card
      title="第三方通知 Webhook (Slack / Discord / Telegram)"
      right={<Button size="sm" onClick={() => setOpen(true)}>配置 Webhook</Button>}
      pad={false}
    >
      <div className="divide-y divide-line">
        {channels.map((c) => {
          const isConfigured = !!c.info?.configured;
          const sourceText = c.info?.source === "db" ? "資料庫覆蓋" : c.info?.source === "env" ? "ENV 環境變數" : "";
          return (
            <div key={c.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink">{c.name}</span>
                  {isConfigured ? (
                    <Badge tone="ok">已啟用{sourceText ? ` (${sourceText})` : ""}</Badge>
                  ) : (
                    <Badge tone="muted">未配置</Badge>
                  )}
                </div>
                <div className="mt-1 font-mono text-[12px] text-ink-3 break-all">
                  {c.desc}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  disabled={!isConfigured}
                  busy={pending === `test-${c.id}`}
                  onClick={() => handleTest(c.id, c.name)}
                >
                  發送測試
                </Button>
                <Button size="sm" tone="secondary" onClick={() => setOpen(true)}>
                  修改
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <ReasonDialog
        open={open}
        title="配置第三方通知 Webhook"
        description="在此輸入 Slack、Discord 或 Telegram Webhook。儲存後將寫入資料庫並優先於 ENV 生效，即刻應用於模型熔斷告警與意見反饋推播。若想清除某個設定，可填入符號 -。"
        confirmLabel="儲存配置"
        busy={pending === "save-webhooks"}
        onClose={() => setOpen(false)}
        onSubmit={async (reason) => {
          const payload: Record<string, string> = {};
          if (form.slackWebhookUrl.trim()) payload.slackWebhookUrl = form.slackWebhookUrl.trim() === "-" ? "" : form.slackWebhookUrl.trim();
          if (form.discordWebhookUrl.trim()) payload.discordWebhookUrl = form.discordWebhookUrl.trim() === "-" ? "" : form.discordWebhookUrl.trim();
          if (form.telegramBotToken.trim()) payload.telegramBotToken = form.telegramBotToken.trim() === "-" ? "" : form.telegramBotToken.trim();
          if (form.telegramChatId.trim()) payload.telegramChatId = form.telegramChatId.trim() === "-" ? "" : form.telegramChatId.trim();

          const ok = await run(
            "PUT",
            "/api/admin/settings/webhooks",
            { ...payload, reason: reason || "更新 Webhook 配置" },
            { label: "save-webhooks", success: "Webhook 配置已成功更新" }
          );
          if (ok !== null) {
            setForm({ slackWebhookUrl: "", discordWebhookUrl: "", telegramBotToken: "", telegramChatId: "" });
            return true;
          }
          return false;
        }}
      >
        <div className="space-y-3">
          <Field label="Slack Incoming Webhook URL" hint="格式如 https://hooks.slack.com/services/...">
            <Input
              type="text"
              placeholder={webhooks?.slack?.valueMasked || "https://hooks.slack.com/services/..."}
              value={form.slackWebhookUrl}
              onChange={(e) => setForm({ ...form, slackWebhookUrl: e.target.value })}
            />
          </Field>
          <Field label="Discord Webhook URL" hint="格式如 https://discord.com/api/webhooks/...">
            <Input
              type="text"
              placeholder={webhooks?.discord?.valueMasked || "https://discord.com/api/webhooks/..."}
              value={form.discordWebhookUrl}
              onChange={(e) => setForm({ ...form, discordWebhookUrl: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Telegram Bot Token" hint="從 @BotFather 取得之 Bot Token">
              <Input
                type="text"
                placeholder={webhooks?.telegram?.valueMasked || "123456:ABC-DEF..."}
                value={form.telegramBotToken}
                onChange={(e) => setForm({ ...form, telegramBotToken: e.target.value })}
              />
            </Field>
            <Field label="Telegram Chat ID" hint="群組、頻道或個人 ID，如 -100123456789">
              <Input
                type="text"
                placeholder={webhooks?.telegram?.extraMasked || "-100123456789"}
                value={form.telegramChatId}
                onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </ReasonDialog>
    </Card>
  );
}

function QrSlot({ slot, label, src }: { slot: "wechatQr" | "feishuQr"; label: string; src: string }) {
  const { run, pending } = useAdminAction();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-4">
      <img src={src} alt={label} className="size-28 rounded-card bg-white object-contain p-1.5 ring-1 ring-line" />
      <div>
        <div className="text-[14px] font-medium text-ink">{label}</div>
        <div className="mt-0.5 break-all font-mono text-[11.5px] text-ink-4">{src}</div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) return toast("图片最大 2MB", "error");
            const image = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            await run("POST", "/api/admin/settings/contact-qr", { slot, image }, { label: `qr-${slot}`, success: `${label}已更换，关于页 5 分钟内更新` });
          }}
        />
        <Button className="mt-2" size="sm" busy={pending === `qr-${slot}`} onClick={() => input.current?.click()}>更换图片</Button>
      </div>
    </div>
  );
}

function BudgetRow({ b }: { b: Settings["budgets"][number] }) {
  const { run, pending } = useAdminAction();
  const [v, setV] = useState({ perMinute: b.per_minute, perHour: b.per_hour, perDay: b.per_day });
  const [open, setOpen] = useState(false);
  const changed = v.perMinute !== b.per_minute || v.perHour !== b.per_hour || v.perDay !== b.per_day;
  return (
    <tr className="border-b border-line/70 last:border-0">
      <td className="px-3 py-2 font-mono text-[12.5px]">{b.service}</td>
      {(["perMinute", "perHour", "perDay"] as const).map((k) => (
        <td key={k} className="px-3 py-2">
          <Input type="number" min={0} className="!w-24 !py-1 text-right" value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} />
        </td>
      ))}
      <td className="num px-3 py-2 text-right text-ink-3">{num(b.used_hour)} / {num(b.used_day)}</td>
      <td className="px-3 py-2 text-right">
        <Button size="sm" tone="primary" disabled={!changed} onClick={() => setOpen(true)}>保存</Button>
        <ReasonDialog
          open={open}
          title={`調整 ${b.service} 的請求上限`}
          description="上限是付费请求的熔断：超过后请求暂停并按窗口重试。填 0 表示立即停用这个服务。"
          confirmLabel="保存"
          busy={pending === "budget"}
          onClose={() => setOpen(false)}
          onSubmit={async (reason) => (await run("PUT", `/api/admin/budgets/${encodeURIComponent(b.service)}`, { ...v, reason }, { label: "budget", success: "上限已更新" })) !== null}
        />
      </td>
    </tr>
  );
}

function TargetToggle({ t }: { t: Settings["targets"][number] }) {
  const { run, pending } = useAdminAction();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" tone={t.enabled ? "danger" : "primary"} onClick={() => setOpen(true)}>{t.enabled ? "停用" : "启用"}</Button>
      <ReasonDialog
        open={open}
        title={`${t.enabled ? "停用" : "启用"}：${t.note ?? t.key}`}
        description={t.enabled ? "停用后新的推送不再发往这个群。" : "启用时间会被记录：启用之前的内容不会补推。开发与彩排环境即使启用也不会真的发出。"}
        danger={t.enabled}
        confirmLabel={t.enabled ? "停用" : "启用"}
        busy={pending === "target"}
        onClose={() => setOpen(false)}
        onSubmit={async (reason) => (await run("POST", `/api/admin/notify-targets/${encodeURIComponent(t.key)}`, { enabled: !t.enabled, reason }, { label: "target", success: "已更新" })) !== null}
      />
    </>
  );
}

export default function SettingsAdmin({ loaderData: s }: Route.ComponentProps) {
  return (
    <AdminPage title="设置" subtitle="不改代码即可替换的运营设置。每次修改都写入审计记录。">
      <div className="space-y-6">
        <WebhooksCard webhooks={s.webhooks} />

        <div className="grid gap-5 xl:grid-cols-2">
          <Card title="通知目的地（飛書群組）" pad={false}>
            <DataTable
              rows={s.targets}
              rowKey={(t) => t.key}
              columns={[
                { key: "k", label: "目的地", render: (t) => <div><div className="font-medium text-ink">{t.note ?? t.key}</div><div className="font-mono text-[11.5px] text-ink-4">{t.key} · {t.config_ref}</div></div> },
                { key: "e", label: "状态", render: (t) => (t.enabled ? <Badge tone="ok">启用于 {bj(t.enabled_at)}</Badge> : <Badge>停用</Badge>) },
                { key: "d", label: "7 天投递", align: "right", render: (t) => num(t.deliveries_7d) },
                { key: "a", label: "", align: "right", render: (t) => <TargetToggle t={t} /> },
              ]}
            />
          </Card>
          <Card title="关于页二维码">
            <div className="space-y-5">
              <QrSlot slot="wechatQr" label="微信公众号二维码" src={s.contact.wechatQr} />
              <QrSlot slot="feishuQr" label="飞书群二维码" src={s.contact.feishuQr} />
            </div>
          </Card>
        </div>

        <Card title="付费请求上限" right={<span>已用：近 1 小时 / 近 24 小时</span>} pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-ink-3">
                  <th className="px-3 py-2 font-medium">服务</th>
                  <th className="px-3 py-2 font-medium">每分钟</th>
                  <th className="px-3 py-2 font-medium">每小时</th>
                  <th className="px-3 py-2 font-medium">每天</th>
                  <th className="px-3 py-2 text-right font-medium">已用</th>
                  <th />
                </tr>
              </thead>
              <tbody>{s.budgets.map((b) => <BudgetRow key={`${b.service}-${b.updated_at}`} b={b} />)}</tbody>
            </table>
          </div>
        </Card>
      </div>
    </AdminPage>
  );
}
