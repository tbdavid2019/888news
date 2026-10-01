// Shared admin vocabulary.
export const KIND_LABEL: Record<string, string> = { rss: "RSS", web_list: "網頁列表", json_list: "JSON", x_search: "X", mp_account: "公眾號", external: "外部回報" };
export const MODE_LABEL: Record<string, string> = { editorial: "精選", hot_signal: "氛圍", isolated: "隔離" };
export const HEALTH_LABEL: Record<string, string> = { ok: "正常", degraded: "不穩定", failing: "失敗", paused: "已暫停", unknown: "未檢查" };
export const VISIBILITY_LABEL: Record<string, string> = { public: "公開", "summary-only": "僅摘要", withdrawn: "已下架" };
export const FEEDBACK_STATUS: Record<string, string> = { new: "新反饋", triaged: "處理中", replied: "已回覆", resolved: "已解決", spam: "垃圾訊息" };
export const TIER_LABEL: Record<string, string> = { T1: "T1", T1_5: "T1.5", T2: "T2", EXCLUDE_MP: "排除公眾號" };
