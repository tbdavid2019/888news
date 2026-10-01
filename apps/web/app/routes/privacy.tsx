import { SITE } from "@aihot/industry/site";
import { pageMeta } from "../lib/seo";
import { prepareCopy } from "../lib/site-copy";
import copy from "@aihot/industry/pages/privacy.md?raw";
import { CopyPage, LegalFooterLinks } from "../features/copy/CopyPage";

const PRIVACY = prepareCopy(copy);

/** Shared caches may keep this page for five minutes. */
export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

export function meta() {
  return pageMeta({ title: "隱私說明", description: `本站如何處理瀏覽器本地資料、反饋資料與訪問日誌。`, path: "/privacy", image: "/og/pages/privacy.png" });
}

export default function PrivacyPage() {
  return (
    <CopyPage
      doc={PRIVACY.doc}
      rendered={PRIVACY.rendered}
      eyebrow={SITE.name}
      footer={<LegalFooterLinks links={[{ to: "/terms", label: "使用規則" }, { to: "/feedback", label: "反饋頁" }]} note={`隱私說明 ${PRIVACY.doc.meta["版本"] ?? ""} · ${PRIVACY.doc.meta["生效日期"] ?? ""}`} />}
    />
  );
}
