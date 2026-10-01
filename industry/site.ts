// 站点身份和读者看得到的文案。换成你的行业时，先改这个文件。
// 网页和后端都读它；改完重新构建（docker compose up --build）即可生效。
// 域名不在这里：部署时用环境变量 SITE_URL 设置。

export const SITE = {
  /** 站名：导航、页面标题、分享图、RSS、MCP、后台都用它。 */
  name: "888news",
  /**
   * 行业词：拼进默认说法里，比如“AI 日报”“AI 动态”。
   * 改成“法律”“HR”“黄金”之类，页面上就会变成“法律日报”“法律动态”。
   */
  subject: "AI",
  /** 首页的完整标题（浏览器标签、搜索结果）。 */
  homeTitle: "888news — AI 科技動態 · 每日精選與情報",
  /** 一句话介绍：搜索引擎、分享卡片、RSS、llms.txt 会用。 */
  description: "888news 自動追蹤全球上百個頂尖科技與 AI 信源，涵蓋 OpenAI、Google、Anthropic、Meta 等最新動態。透過 AI 模型即時摘要、品質評分與多源報導歸組，過濾行銷噪音，每日清晨精準呈獻高價值科技情報與前沿深度觀察。",
  /** 首页左上角和侧边栏下面的一行小字。 */
  tagline: "值得關注的 AI 科技動態",
  /** 界面语言（HTML lang、og:locale）。 */
  locale: "zh-TW",
  /** 默认域名，只在没设置 SITE_URL 时使用。 */
  defaultUrl: "http://localhost:3000",
  /**
   * MCP 工具名的前缀（小写字母、数字、下划线），工具会叫 news888_get_latest、news888_search……
   * 已经有人接入后就不要再改。
   */
  mcpPrefix: "news888",
  /** 对外联系邮箱（选填）：使用规则、llms.txt、响应头里会写。 */
  contactEmail: null as string | null,
  /** 页脚的一行小字（选填）。 */
  footerNote: "由 888news 開源專案驅動",
  /** 中国大陆网站的 ICP 备案号（选填，支持通过环境变量 SITE_ICP 配置，默认无）。 */
  icp: (typeof process !== "undefined" && process.env?.SITE_ICP ? process.env.SITE_ICP : null) as string | null,
  /** GitHub 开源仓库链接（选填，支持通过环境变量 GITHUB_REPO_URL 配置）。 */
  githubUrl: (typeof process !== "undefined" && process.env?.GITHUB_REPO_URL ? process.env.GITHUB_REPO_URL : "https://github.com/tbdavid2019/888news") as string | null,
  /** 结构化数据里的网站运营者（搜索引擎用）。 */
  organization: {
    name: "888news",
    /** 创始人（选填）：{ name, url, description }。 */
    founder: null as null | { name: string; url?: string; description?: string },
  },
  /** 抓取信源时报上的名字（User-Agent 里用），不要冒用别的站。 */
  crawlerName: "888NewsBot",
} as const;

/** 關於頁文案。數字（信源數、收錄數、精選數、日報期數）來自站內即時統計。 */
export const ABOUT = {
  kicker: `關於 ${SITE.name}`,
  /** 大標題：第一行正常顏色，第二行強調色。 */
  headline: ["科技圈每天都有新動靜，", "值得看的，只有幾條。"] as [string, string],
  /** 標題下面的一段話。{sources} 會換成實時的信源數。 */
  lead: `${SITE.name} 為您追蹤 {sources} 個精選信源：抓取、歸併、評分、精選，每天早上 8 點出產情報日報。免費、無需註冊。`,
  /** 信源河動畫下面的四個環節。 */
  steps: {
    collect: "官方部落格、科技媒體、X（Twitter）帳號與各類 RSS 訂閱源都在追蹤；活躍信源每 15 分鐘抓取一次。",
    store: "即時保存所有抓取內容，同一事件的多篇報導自動歸組；熱點榜即基於各方聲量即時計算。",
    select: "AI 模型先行過濾行業相關性與實質資訊，自動生成中文標題、摘要與推薦理由；過濾行銷農場文與重複轉發。",
    publish: "每日 08:00 出版日報，週一出版週報，每月 1 日出版月報；亦支援即時推播至 Slack、Discord 與 Telegram。",
  },
  /**
   * 作者块（选填），null 就不显示。
   * avatarSourceId：一个 X 账号信源的 id，头像取它的（选填）。
   * 二维码在后台“设置”里上传，或者放进 industry/brand/contact/；没有二维码就不显示那张卡片。
   */
  maker: null as null | {
    name: string;
    greeting: string[];
    avatarSourceId?: string | null;
    wechat?: { title: string; note: string };
    feishu?: { title: string; note: string };
  },
  /** 页面底部的版权与下架说明（结尾会接“反馈页”的链接）。 */
  copyright: `${SITE.name} 是聚合摘要和阅读索引，原文版权归各来源所有。如果你是来源方，希望更正、下架或调整展示方式，可以通过`,
} as const;

/** “AI 日报”这类说法：行业词和名词之间，英文词加空格，中文词不加。 */
export function withSubject(noun: string): string {
  return /[A-Za-z0-9]$/.test(SITE.subject) ? `${SITE.subject} ${noun}` : `${SITE.subject}${noun}`;
}
