import { sql } from "../packages/backend/src/db.ts";
import { cleanTweetText } from "../packages/backend/src/content/sanitize.ts";

async function main() {
  console.log("Cleaning dirty tweets in PostgreSQL...");

  const rows = await sql<{ id: string; x_post: Record<string, any>; body_text: string | null }[]>`
    SELECT id, x_post, body_text FROM articles WHERE x_post IS NOT NULL
  `;

  console.log(`Found ${rows.length} articles with x_post`);
  let updatedCount = 0;

  for (const row of rows) {
    const rawText = String(row.x_post.text ?? row.body_text ?? "");
    const cleaned = cleanTweetText(rawText);

    let needsUpdate = false;
    let newXPost = { ...row.x_post };

    if (cleaned !== rawText) {
      needsUpdate = true;
      newXPost.text = cleaned;
    }

    if (newXPost.quoted && typeof newXPost.quoted === "object") {
      const qText = String(newXPost.quoted.text ?? "");
      const qCleaned = cleanTweetText(qText);
      if (qCleaned !== qText) {
        needsUpdate = true;
        newXPost.quoted = { ...newXPost.quoted, text: qCleaned };
      }
    }

    if (needsUpdate) {
      await sql`
        UPDATE articles
        SET x_post = ${sql.json(newXPost)}, body_text = ${cleaned}
        WHERE id = ${row.id}
      `;
      updatedCount++;
    }
  }

  console.log(`Successfully cleaned ${updatedCount} articles!`);
  await sql.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
