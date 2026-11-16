/**
 * Fixes known OpenCC (cn -> twp) over-conversions on text that is already in Traditional Chinese.
 */
export function fixTwOverConversion(text: string): string {
  return text
    .replace(/係統/g, "系統")
    .replace(/例項/g, "實例")
    .replace(/聯結器/g, "連接器")
    .replace(/AI\s*智慧體|智慧體/g, "AI 助理");
}
