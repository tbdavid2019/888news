import { SITE } from "@aihot/industry/site";
import { Form, Link, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/content";
import { adminGet } from "../../lib/admin.server";
import { VISIBILITY_LABEL } from "../../features/admin/labels";
import { AdminPage, Badge, Button, Card, DataTable, Empty, Input, Time } from "../../features/admin/ui";

interface Row {
  id: string;
  title: string;
  url: string;
  source: string;
  discovered_at: string;
  processing_state: string;
  visibility: string | null;
  selected: boolean | null;
  score: number | null;
}

export async function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return { q, rows: [] as Row[] };
  const { rows } = await adminGet<{ rows: Row[] }>(request, `/api/admin/content?q=${encodeURIComponent(q)}`);
  return { q, rows };
}

export const meta: Route.MetaFunction = () => [{ title: `內容診斷 · ${SITE.name} 後台` }];

export default function Content({ loaderData }: Route.ComponentProps) {
  const { q, rows } = loaderData;
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  return (
    <AdminPage title="內容診斷" subtitle="按 ID、原文連結或標題找到任何一則內容，檢視它從信源到公開出口的完整歷程；下架、僅摘要、人工修正和重新處理都在詳情頁。">
      <Form method="get" className="mb-5 flex max-w-2xl gap-2">
        <Input name="q" defaultValue={sp.get("q") ?? ""} placeholder="內容 ID、URL 或標題關鍵字" aria-label="搜尋內容" autoFocus />
        <Button type="submit" tone="primary">搜尋</Button>
      </Form>
      {q && (
        <Card pad={false} title={`「${q}」的結果`} right={<span>{rows.length === 50 ? "僅顯示最近 50 筆" : `${rows.length} 筆`}</span>}>
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/admin/content/${r.id}`)}
            empty="找不到符合項目。URL 會先正規化再比對；標題支援中英文關鍵字。"
            columns={[
              {
                key: "t",
                label: "標題",
                render: (r) => (
                  <div className="min-w-[320px]">
                    <Link to={`/admin/content/${r.id}`} className="font-medium text-ink hover:text-accent" onClick={(e) => e.stopPropagation()}>{r.title}</Link>
                    <div className="font-mono text-[11.5px] text-ink-4">{r.id}</div>
                  </div>
                ),
              },
              { key: "src", label: "信源", render: (r) => <span className="whitespace-nowrap">{r.source}</span> },
              {
                key: "st",
                label: "狀態",
                render: (r) => (
                  <span className="flex flex-wrap gap-1">
                    {r.selected && <Badge tone="accent">精選</Badge>}
                    {r.visibility && <Badge tone={r.visibility === "public" ? "muted" : "warn"}>{VISIBILITY_LABEL[r.visibility] ?? r.visibility}</Badge>}
                    {!r.visibility && <Badge>{r.processing_state}</Badge>}
                  </span>
                ),
              },
              { key: "sc", label: "分數", align: "right", render: (r) => r.score ?? "—" },
              { key: "d", label: "發現", render: (r) => <Time at={r.discovered_at} /> },
            ]}
          />
        </Card>
      )}
      {!q && <Empty>輸入 ID、連結或標題開始搜尋。</Empty>}
    </AdminPage>
  );
}
