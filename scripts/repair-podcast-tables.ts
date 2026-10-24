// Scans podcast_episodes, articles, and translations tables for unrendered Markdown tables in HTML,
// safely converting <p>| ... <br>|---|...</p> into clean, sanitized <table> elements.
// Supports dry-run: node --env-file=.env scripts/repair-podcast-tables.ts [--dry-run]
import { sql, closeDb } from "@aihot/backend/db";
import { renderTablesInHtml, sanitizeBody } from "@aihot/backend/content/sanitize";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`Starting table repair (${dryRun ? "DRY-RUN mode" : "LIVE execution"})...`);

  // 1. Repair podcast_episodes
  const episodes = await sql<{ id: string; body_html: string }[]>`
    SELECT id, body_html FROM podcast_episodes
    WHERE body_html ~ '\|(\s*:?-{3,}:?\s*\|)+' OR body_html LIKE '%<p>|%'
  `;
  console.log(`Found ${episodes.length} candidate podcast episodes.`);

  let epUpdated = 0;
  for (const ep of episodes) {
    const fixed = sanitizeBody(renderTablesInHtml(ep.body_html));
    if (fixed !== ep.body_html) {
      if (!dryRun) {
        await sql`UPDATE podcast_episodes SET body_html = ${fixed} WHERE id = ${ep.id}`;
      }
      epUpdated++;
    }
  }

  // 2. Repair articles
  const articles = await sql<{ id: string; body_html: string }[]>`
    SELECT id, body_html FROM articles
    WHERE body_html ~ '\|(\s*:?-{3,}:?\s*\|)+' OR body_html LIKE '%<p>|%'
  `;
  console.log(`Found ${articles.length} candidate articles.`);

  let artUpdated = 0;
  for (const a of articles) {
    const fixed = sanitizeBody(renderTablesInHtml(a.body_html));
    if (fixed !== a.body_html) {
      if (!dryRun) {
        await sql`UPDATE articles SET body_html = ${fixed} WHERE id = ${a.id}`;
      }
      artUpdated++;
    }
  }

  // 3. Repair translations
  const translations = await sql<{ article_id: string; lang: string; body_html: string }[]>`
    SELECT article_id, lang, body_html FROM translations
    WHERE body_html ~ '\\|(\\s*:?-{3,}:?\\s*\\|)+' OR body_html LIKE '%<p>|%'
  `;
  console.log(`Found ${translations.length} candidate translations.`);

  let trUpdated = 0;
  for (const tr of translations) {
    const fixed = sanitizeBody(renderTablesInHtml(tr.body_html));
    if (fixed !== tr.body_html) {
      if (!dryRun) {
        await sql`UPDATE translations SET body_html = ${fixed} WHERE article_id = ${tr.article_id} AND lang = ${tr.lang}`;
      }
      trUpdated++;
    }
  }

  console.log(`Table repair summary:`);
  console.log(`  - Podcast episodes: ${epUpdated} ${dryRun ? "would be updated" : "updated"}`);
  console.log(`  - Articles:         ${artUpdated} ${dryRun ? "would be updated" : "updated"}`);
  console.log(`  - Translations:     ${trUpdated} ${dryRun ? "would be updated" : "updated"}`);

  await closeDb();
}

main().catch((err) => {
  console.error("Error in repair-podcast-tables:", err);
  process.exit(1);
});
