// Re-composes a daily report for a given Beijing date (default: today's date).
// Usage: node scripts/recompose-daily.ts [YYYY-MM-DD]
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { composeDaily } from "@aihot/backend/reports/compose";

function beijingDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const date = process.argv[2] || beijingDate(new Date());

console.log(`Re-composing daily report for ${date}...`);

// 1. Mark fake / pinned pseudo-tweets with #hash URLs as withdrawn so they won't enter candidates
const fakeTweets = await sql<{ id: string; url: string; title: string }[]>`
  UPDATE publications
  SET visibility = 'withdrawn'
  WHERE (url ~* 'x\\.com\\/[^/]+#[0-9a-f]{16}' OR original_title ILIKE '* Pinned%')
    AND visibility = 'public'
  RETURNING article_id AS id, url, title
`;

if (fakeTweets.length > 0) {
  console.log(`Withdrew ${fakeTweets.length} fake/pinned tweet publication(s):`);
  for (const t of fakeTweets) {
    console.log(`  - [${t.id}] ${t.title} (${t.url})`);
  }
}

// 2. Re-compose daily report
const result = await composeDaily(date, "manual-fix");
console.log(`✓ Daily report for ${result.key} generated with ${result.entries} entries.`);

await stopBoss();
await closeDb();
