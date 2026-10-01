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

export interface LlmChannelConfig {
  baseUrl: string;
  model: string;
  apiKeyMasked: string | null;
  isConfigured: boolean;
  source: "env" | "db" | "none";
}

export interface LlmSettings {
  primary: LlmChannelConfig;
  fallback1: LlmChannelConfig;
  fallback2: LlmChannelConfig;
  waitingCount: number;
}

interface Settings {
  contact: { wechatQr: string; feishuQr: string };
  targets: Array<{ key: string; purpose: string; kind: string; enabled: boolean; enabled_at: string | null; config_ref: string | null; note: string | null; deliveries_7d: number; last_sent_at: string | null }>;
  budgets: Array<{ service: string; per_minute: number; per_hour: number; per_day: number; note: string | null; updated_at: string; used_day: number; used_hour: number }>;
  webhooks?: WebhooksSettings;
  llm?: LlmSettings;
}

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<Settings>(request, "/api/admin/settings");
}

export const meta: Route.MetaFunction = () => [{ title: `系統設定 · ${SITE.name} 後台` }];

function LlmCard({ llm }: { llm?: LlmSettings }) {
  const { run, pending } = useAdminAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    llmBaseUrl: "",
    llmApiKey: "",
    llmModel: "",
    llmFallback1BaseUrl: "",
    llmFallback1ApiKey: "",
    llmFallback1Model: "",
    llmFallback2BaseUrl: "",
    llmFallback2ApiKey: "",
    llmFallback2Model: "",
  });

  const handleTest = async (target: "default" | "fallback_1" | "fallback_2", name: string) => {
    const res = await run<{ ok: boolean; model?: string; error?: string }>(
      "POST",
      "/api/admin/settings/llm/test",
      { target },
      { label: `test-llm-${target}`, revalidate: false }
    );
    if (res?.ok) {
      toast(`${name} 連線測試成功！模型 (${res.model}) 回應正常。`, "ok");
    } else if (res?.error) {
      toast(`${name} 連線失敗：${res.error}`, "error");
    }
  };

  const handleRequeue = async () => {
    const res = await run<{ count: number }>(
      "POST",
      "/api/admin/settings/llm/requeue",
      {},
      { label: "requeue-articles", success: "已成功重置！文章已加入佇列排隊處理。" }
    );
  };

  const isPrimaryConfigured = !!llm?.primary.isConfigured;
  const primarySource = llm?.primary.source === "db" ? "資料庫覆蓋" : llm?.primary.source === "env" ? "ENV 環境變數" : "";

  return (
    <Card
      title="LLM 模型與 API 金鑰 (支援 OpenAI / Groq / Gemini / 自訂端點)"
      right={
        <div className="flex items-center gap-2">
          {llm && llm.waitingCount > 0 && (
            <Button
              size="sm"
              tone="primary"
              busy={pending === "requeue-articles"}
              onClick={handleRequeue}
              title="清除失敗重試的指數退避計時，立即把所有等待中與失敗的文章送入處理佇列"
            >
              立即重試處理文章 ({llm.waitingCount} 篇待辦)
            </Button>
          )}
          <Button size="sm" onClick={() => setOpen(true)}>配置 LLM</Button>
        </div>
      }
      pad={false}
    >
      <div className="divide-y divide-line">
        {/* Primary LLM */}
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink">主模型 (Primary LLM)</span>
              {isPrimaryConfigured ? (
                <Badge tone="ok">已啟用{primarySource ? ` (${primarySource})` : ""}</Badge>
              ) : (
                <Badge tone="bad">未配置金鑰 (文章無法評分入庫)</Badge>
              )}
            </div>
            <div className="mt-1 font-mono text-[12px] text-ink-3 break-all">
              端點: {llm?.primary.baseUrl} · 模型: {llm?.primary.model} · API Key: {llm?.primary.apiKeyMasked || "未設置"}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              disabled={!isPrimaryConfigured}
              busy={pending === "test-llm-default"}
              onClick={() => handleTest("default", "主模型")}
            >
              測試連線
            </Button>
            <Button size="sm" tone="secondary" onClick={() => setOpen(true)}>
              修改
            </Button>
          </div>
        </div>

        {/* Fallback 1 */}
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink">備援 1 (Fallback 1)</span>
              {llm?.fallback1.isConfigured ? (
                <Badge tone="ok">已啟用備援</Badge>
              ) : (
                <Badge tone="muted">未配置 (可選)</Badge>
              )}
            </div>
            <div className="mt-1 font-mono text-[12px] text-ink-3 break-all">
              端點: {llm?.fallback1.baseUrl || "—"} · 模型: {llm?.fallback1.model || "—"} · API Key: {llm?.fallback1.apiKeyMasked || "—"}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              disabled={!llm?.fallback1.isConfigured}
              busy={pending === "test-llm-fallback_1"}
              onClick={() => handleTest("fallback_1", "備援 1")}
            >
              測試連線
            </Button>
            <Button size="sm" tone="secondary" onClick={() => setOpen(true)}>
              修改
            </Button>
          </div>
        </div>

        {/* Fallback 2 */}
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink">備援 2 (Fallback 2)</span>
              {llm?.fallback2.isConfigured ? (
                <Badge tone="ok">已啟用備援</Badge>
              ) : (
                <Badge tone="muted">未配置 (可選)</Badge>
              )}
            </div>
            <div className="mt-1 font-mono text-[12px] text-ink-3 break-all">
              端點: {llm?.fallback2.baseUrl || "—"} · 模型: {llm?.fallback2.model || "—"} · API Key: {llm?.fallback2.apiKeyMasked || "—"}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              disabled={!llm?.fallback2.isConfigured}
              busy={pending === "test-llm-fallback_2"}
              onClick={() => handleTest("fallback_2", "備援 2")}
            >
              測試連線
            </Button>
            <Button size="sm" tone="secondary" onClick={() => setOpen(true)}>
              修改
            </Button>
          </div>
        </div>
      </div>

      <ReasonDialog
        open={open}
        title="配置 LLM 模型與 API Key"
        description="在此輸入主模型與備援模型設定。儲存後會即時寫入資料庫並優先於 ENV 生效，系統將自動重置待辦文章佇列並開始處理。留空則保持原值，清除請填 -。"
        confirmLabel="儲存配置"
        busy={pending === "save-llm"}
        onClose={() => setOpen(false)}
        onSubmit={async (reason) => {
          const payload: Record<string, string> = {};
          if (form.llmBaseUrl.trim()) payload.llmBaseUrl = form.llmBaseUrl.trim();
          if (form.llmApiKey.trim()) payload.llmApiKey = form.llmApiKey.trim();
          if (form.llmModel.trim()) payload.llmModel = form.llmModel.trim();
          if (form.llmFallback1BaseUrl.trim()) payload.llmFallback1BaseUrl = form.llmFallback1BaseUrl.trim();
          if (form.llmFallback1ApiKey.trim()) payload.llmFallback1ApiKey = form.llmFallback1ApiKey.trim();
          if (form.llmFallback1Model.trim()) payload.llmFallback1Model = form.llmFallback1Model.trim();
          if (form.llmFallback2BaseUrl.trim()) payload.llmFallback2BaseUrl = form.llmFallback2BaseUrl.trim();
          if (form.llmFallback2ApiKey.trim()) payload.llmFallback2ApiKey = form.llmFallback2ApiKey.trim();
          if (form.llmFallback2Model.trim()) payload.llmFallback2Model = form.llmFallback2Model.trim();

          const ok = await run(
            "PUT",
            "/api/admin/settings/llm",
            { ...payload, reason: reason || "更新 LLM 配置" },
            { label: "save-llm", success: "LLM 配置已成功更新！待辦文章已自動重置並排入處理佇列。" }
          );
          if (ok !== null) {
            setForm({
              llmBaseUrl: "", llmApiKey: "", llmModel: "",
              llmFallback1BaseUrl: "", llmFallback1ApiKey: "", llmFallback1Model: "",
              llmFallback2BaseUrl: "", llmFallback2ApiKey: "", llmFallback2Model: "",
            });
            return true;
          }
          return false;
        }}
      >
        <div className="space-y-4">
          <div className="rounded-control bg-bg-sunk p-3 space-y-3">
            <div className="text-[13px] font-semibold text-ink">主模型（必填）</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Base URL" hint="OpenAI / Groq / Gemini 或自訂相容端點">
                <Input
                  type="text"
                  placeholder={llm?.primary.baseUrl || "https://api.openai.com/v1"}
                  value={form.llmBaseUrl}
                  onChange={(e) => setForm({ ...form, llmBaseUrl: e.target.value })}
                />
              </Field>
              <Field label="模型名稱 (Model)" hint="如 gpt-4o-mini、llama-3.3-70b-versatile">
                <Input
                  type="text"
                  placeholder={llm?.primary.model || "gpt-4o-mini"}
                  value={form.llmModel}
                  onChange={(e) => setForm({ ...form, llmModel: e.target.value })}
                />
              </Field>
            </div>
            <Field label="API Key" hint="填入您的 API 金鑰（留空保持不變）">
              <Input
                type="password"
                placeholder={llm?.primary.apiKeyMasked || "sk-..."}
                value={form.llmApiKey}
                onChange={(e) => setForm({ ...form, llmApiKey: e.target.value })}
              />
            </Field>
          </div>

          <div className="rounded-control bg-bg-sunk p-3 space-y-3">
            <div className="text-[13px] font-semibold text-ink">備援 1 (Fallback 1，選填)</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Fallback 1 Base URL">
                <Input
                  type="text"
                  placeholder={llm?.fallback1.baseUrl || "https://api.groq.com/openai/v1"}
                  value={form.llmFallback1BaseUrl}
                  onChange={(e) => setForm({ ...form, llmFallback1BaseUrl: e.target.value })}
                />
              </Field>
              <Field label="Fallback 1 Model">
                <Input
                  type="text"
                  placeholder={llm?.fallback1.model || "llama-3.3-70b-versatile"}
                  value={form.llmFallback1Model}
                  onChange={(e) => setForm({ ...form, llmFallback1Model: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Fallback 1 API Key">
              <Input
                type="password"
                placeholder={llm?.fallback1.apiKeyMasked || "gsk_..."}
                value={form.llmFallback1ApiKey}
                onChange={(e) => setForm({ ...form, llmFallback1ApiKey: e.target.value })}
              />
            </Field>
          </div>

          <div className="rounded-control bg-bg-sunk p-3 space-y-3">
            <div className="text-[13px] font-semibold text-ink">備援 2 (Fallback 2，選填)</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Fallback 2 Base URL">
                <Input
                  type="text"
                  placeholder={llm?.fallback2.baseUrl || "https://generativelanguage.googleapis.com/v1beta/openai/"}
                  value={form.llmFallback2BaseUrl}
                  onChange={(e) => setForm({ ...form, llmFallback2BaseUrl: e.target.value })}
                />
              </Field>
              <Field label="Fallback 2 Model">
                <Input
                  type="text"
                  placeholder={llm?.fallback2.model || "gemini-2.5-flash"}
                  value={form.llmFallback2Model}
                  onChange={(e) => setForm({ ...form, llmFallback2Model: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Fallback 2 API Key">
              <Input
                type="password"
                placeholder={llm?.fallback2.apiKeyMasked || "AIza..."}
                value={form.llmFallback2ApiKey}
                onChange={(e) => setForm({ ...form, llmFallback2ApiKey: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </ReasonDialog>
    </Card>
  );
}

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



const OBSOLETE_SERVICES = new Set(["jina", "socialdata", "dajiala", "zhipu", "mimo", "dashscope", "deepseek"]);

const BUDGET_SERVICE_INFO: Record<string, { label: string; note: string; tone?: "ok" | "muted" | "accent" }> = {
  llm: { label: "LLM 主模型", note: "文章處理、判斷與翻譯之熔斷上限", tone: "accent" },
  embedding: { label: "Embedding 向量", note: "向量調用熔斷上限", tone: "muted" },
};

function BudgetRow({ b }: { b: Settings["budgets"][number] }) {
  const { run, pending } = useAdminAction();
  const [v, setV] = useState({ perMinute: b.per_minute, perHour: b.per_hour, perDay: b.per_day });
  const [open, setOpen] = useState(false);
  const changed = v.perMinute !== b.per_minute || v.perHour !== b.per_hour || v.perDay !== b.per_day;
  const info = BUDGET_SERVICE_INFO[b.service];
  return (
    <tr className="border-b border-line/70 last:border-0">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12.5px] font-semibold text-ink">{b.service}</span>
          {info && <Badge tone={info.tone ?? "muted"}>{info.label}</Badge>}
        </div>
        <div className="text-[11.5px] text-ink-4 mt-0.5">{info ? info.note : (b.note || "服務調用熔斷")}</div>
      </td>
      {(["perMinute", "perHour", "perDay"] as const).map((k) => (
        <td key={k} className="px-3 py-2">
          <Input type="number" min={0} className="!w-24 !py-1 text-right" value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} />
        </td>
      ))}
      <td className="num px-3 py-2 text-right text-ink-3">{num(b.used_hour)} / {num(b.used_day)}</td>
      <td className="px-3 py-2 text-right">
        <Button size="sm" tone="primary" disabled={!changed} onClick={() => setOpen(true)}>儲存</Button>
        <ReasonDialog
          open={open}
          title={`調整 ${b.service} 的請求上限`}
          description="上限是服務調用的熔斷限制：超過後請求暫停並按窗口重試。填 0 表示立即停用此服務。"
          confirmLabel="儲存"
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
      <Button size="sm" tone={t.enabled ? "danger" : "primary"} onClick={() => setOpen(true)}>{t.enabled ? "停用" : "啟用"}</Button>
      <ReasonDialog
        open={open}
        title={`${t.enabled ? "停用" : "啟用"}：${t.note ?? t.key}`}
        description={t.enabled ? "停用後新的推送不再發往此通道。" : "啟用時間會被記錄：啟用之前的內容不會補推。"}
        danger={t.enabled}
        confirmLabel={t.enabled ? "停用" : "啟用"}
        busy={pending === "target"}
        onClose={() => setOpen(false)}
        onSubmit={async (reason) => (await run("POST", `/api/admin/notify-targets/${encodeURIComponent(t.key)}`, { enabled: !t.enabled, reason }, { label: "target", success: "已更新" })) !== null}
      />
    </>
  );
}

export default function SettingsAdmin({ loaderData: s }: Route.ComponentProps) {
  const visibleBudgets = s.budgets.filter((b) => !OBSOLETE_SERVICES.has(b.service));
  const visibleTargets = s.targets.filter((t) => !t.key.startsWith("feishu"));

  return (
    <AdminPage title="系統設定" subtitle="無需修改程式碼即可調整的營運設定。每次修改皆會寫入審計日誌。">
      <div className="space-y-6">
        <LlmCard llm={s.llm} />
        <WebhooksCard webhooks={s.webhooks} />

        {visibleTargets.length > 0 && (
          <Card
            title="通知目的地通道"
            right={<span className="text-[12px] text-ink-4">現代推播請優先使用上方 Webhook</span>}
            pad={false}
          >
            <DataTable
              rows={visibleTargets}
              rowKey={(t) => t.key}
              columns={[
                {
                  key: "k",
                  label: "目的地",
                  render: (t) => (
                    <div>
                      <div className="flex items-center gap-1.5 font-medium text-ink">
                        {t.note ?? t.key}
                      </div>
                      <div className="font-mono text-[11.5px] text-ink-4">{t.key} · {t.config_ref}</div>
                    </div>
                  ),
                },
                { key: "e", label: "狀態", render: (t) => (t.enabled ? <Badge tone="ok">啟用於 {bj(t.enabled_at)}</Badge> : <Badge>停用</Badge>) },
                { key: "d", label: "7 天遞送", align: "right", render: (t) => num(t.deliveries_7d) },
                { key: "a", label: "", align: "right", render: (t) => <TargetToggle t={t} /> },
              ]}
            />
          </Card>
        )}

        <Card title="服務調用上限 (熔斷機制)" right={<span>已用：近 1 小時 / 近 24 小時</span>} pad={false}>
          <div className="p-3 border-b border-line bg-bg-sunk/40 text-[12.5px] text-ink-3">
            此處為後端熔斷安全閥。888news 採零成本架構（X 採集經 2md 免費鏡像，網頁正文本地優先），僅對啟用中的模型服務設定頻率與次數上限保護。
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-ink-3">
                  <th className="px-3 py-2 font-medium">服務</th>
                  <th className="px-3 py-2 font-medium">每分鐘</th>
                  <th className="px-3 py-2 font-medium">每小時</th>
                  <th className="px-3 py-2 font-medium">每天</th>
                  <th className="px-3 py-2 text-right font-medium">已用</th>
                  <th />
                </tr>
              </thead>
              <tbody>{visibleBudgets.map((b) => <BudgetRow key={`${b.service}-${b.updated_at}`} b={b} />)}</tbody>
            </table>
          </div>
        </Card>
      </div>
    </AdminPage>
  );
}
