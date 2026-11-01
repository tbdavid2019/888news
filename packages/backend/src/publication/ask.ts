// Bounded public-context retrieval for user-initiated questions.
import { sql } from "../db.ts";
import { listedCondition } from "./items.ts";
import { withSearchCapacity } from "./pool.ts";

export interface AskItem { title: string; summary: string; url: string }

const STOP_WORDS = new Set(["最近", "目前", "這個", "哪些", "什麼", "如何", "有什麼", "一下", "請問", "相關", "以及", "與否", "about", "what", "the", "and", "how", "are", "for", "with"]);
const segmenter = new Intl.Segmenter("zh", { granularity: "word" });

/** Break natural-language questions into bounded, escaped LIKE terms. */
export function askSearchTerms(query: string): string[] {
  const parts = [...segmenter.segment(query.toLowerCase())];
  const singleRuns = parts.map((part) => part.isWordLike && /^\p{Script=Han}$/u.test(part.segment) ? part.segment : " ").join("").split(/ +/);
  const bigrams = singleRuns.flatMap((run) => [...run].slice(0, -1).map((char, i) => char + [...run][i + 1]));
  const terms = parts
    .filter((part) => part.isWordLike && [...part.segment].length >= 2 && !STOP_WORDS.has(part.segment))
    .map((part) => part.segment.replace(/[\\%_]/g, (char) => `\\${char}`));
  return [...new Set([...terms, ...bigrams])].slice(0, 8);
}

export async function searchAskItems(query: string): Promise<AskItem[]> {
  const terms = askSearchTerms(query);
  if (!terms.length) return [];
  const match = terms.reduce((acc, term, i) => i === 0
    ? sql`p.search_text LIKE ${"%" + term + "%"}`
    : sql`${acc} OR p.search_text LIKE ${"%" + term + "%"}`, sql``);
  const relevance = terms.reduce((acc, term) => sql`${acc} + CASE WHEN p.search_text LIKE ${"%" + term + "%"} THEN 1 ELSE 0 END`, sql`0`);
  const now = new Date();
  const rows = await withSearchCapacity((db) => db<{ id: string; title: string; summary: string | null }[]>`
    SELECT p.article_id AS id, p.title, p.summary FROM publications p
    WHERE ${listedCondition(now)} AND p.eligible AND (${match})
    ORDER BY (${relevance}) DESC, p.timeline_at DESC, p.article_id DESC LIMIT 10`);
  return rows.map((row) => ({ title: row.title, summary: row.summary ?? "", url: `/items/${encodeURIComponent(row.id)}` }));
}
