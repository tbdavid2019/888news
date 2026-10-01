import { SITE } from "@aihot/industry/site";
import { Form, Link, useSearchParams } from "react-router";
import type { Route } from "./+types/audit";
import { adminGet } from "../../lib/admin.server";
import { bj } from "../../features/admin/format";
import { AdminPage, Card, DataTable, Input, Json, Pager } from "../../features/admin/ui";

interface Row {
  id: number;
  created_at: string;
  actor: string;
  action: string;
  subject: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
}

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<{ page: number; rows: Row[] }>(request, `/api/admin/audit${new URL(request.url).search}`);
}

export const meta: Route.MetaFunction = () => [{ title: `審計記錄 · ${SITE.name} 後台` }];

function subjectLink(subject: string | null) {
  if (!subject) return null;
  const [kind, id] = [subject.slice(0, subject.indexOf(":")), subject.slice(subject.indexOf(":") + 1)];
  if (kind === "content") return <Link className="text-accent" to={`/admin/content/${id}`}>{subject}</Link>;
  if (kind === "source") return <Link className="text-accent" to={`/admin/sources/${encodeURIComponent(id)}`}>{subject}</Link>;
  return <span className="font-mono text-[12px]">{subject}</span>;
}

export default function Audit({ loaderData }: Route.ComponentProps) {
  const [sp] = useSearchParams();
  return (
    <AdminPage title="審計記錄" subtitle="所有人工操作：誰、何時、改了什麼、原因為何。">
      <Form method="get" className="mb-4 flex max-w-xl gap-2">
        <Input name="action" defaultValue={sp.get("action") ?? ""} placeholder="操作前綴，例如 content. 或 source." aria-label="依操作篩選" />
        <Input name="subject" defaultValue={sp.get("subject") ?? ""} placeholder="對象，例如 source:openai-blog" aria-label="依對象篩選" />
      </Form>
      <Card pad={false}>
        <DataTable
          rows={loaderData.rows}
          rowKey={(r) => r.id}
          empty="沒有記錄"
          columns={[
            { key: "t", label: "時間", render: (r) => <span className="num whitespace-nowrap">{bj(r.created_at, true)}</span> },
            { key: "a", label: "操作", render: (r) => <span className="font-mono text-[12.5px] text-ink">{r.action}</span> },
            { key: "s", label: "對象", render: (r) => subjectLink(r.subject) },
            { key: "who", label: "操作者", render: (r) => r.actor },
            { key: "r", label: "原因", render: (r) => <span className="text-ink-2">{r.reason}</span> },
            { key: "d", label: "變化", render: (r) => (r.before || r.after ? <Json value={{ before: r.before, after: r.after }} label="前後" /> : null) },
          ]}
        />
      </Card>
      <Pager page={loaderData.page} hasMore={loaderData.rows.length === 100} />
    </AdminPage>
  );
}
