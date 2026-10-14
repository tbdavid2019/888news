import postgres from "postgres";

function cleanTweetText(rawText) {
  if (!rawText) return "";
  let text = rawText;

  // 1. Truncate trailing X login/signup footers and legal garbage
  const cutOffPatterns = [
    /\n+##\s+Log in or sign up[\s\S]*/i,
    /\n+See what[’']s happening and join the conversation[\s\S]*/i,
    /\n+\[Log in with username or email\][\s\S]*/i,
    /\n+\[Terms\]\(https:\/\/x\.com\/tos\)[\s\S]*/i,
    /\n+Don['’]t miss what['’]s happening[\s\S]*/i,
    /\n+New to X\?[\s\S]*/i,
  ];
  for (const pat of cutOffPatterns) {
    text = text.replace(pat, "");
  }

  // 2. Strip trailing tweet action bars / reply engagement counts
  text = text.replace(/\n*\[\d+\]\(https:\/\/x\.com\/compose\/post\?[^\)]+\)[\s\d\.KkMmBb]*$/gi, "");
  text = text.replace(/\s+\[\d+\]\(https:\/\/x\.com\/compose\/post\?[^\)]+\)[\s\d\.KkMmBb]*$/gi, "");
  text = text.replace(/\n*\b\d+\s+\d+[KkMm]?\s+\d+[KkMm]?\s*$/g, "");

  // 3. Fix broken markdown links or orphan brackets from initial regex replacements
  text = text.replace(/^\]\([^\)]+\)\s*/g, "");
  text = text.replace(/^\[!\[Image.*?\]\(.*?\)\]\s*/g, "");

  // 4. Remove leading reply mention leftovers if any
  text = text.replace(/^[^\n]*?detects scam emails \[@\w+\]\(.*?\) \[\w+\]\(https:\/\/x\.com\/.*?\/status\/\d+\)\s*/i, "");
  text = text.replace(/^.*?\[@\w+\]\(https:\/\/x\.com\/\w+\)\s+\[\w+\]\(https:\/\/x\.com\/\w+\/status\/\d+\)\s*/i, "");

  return text.trim();
}

const sql = postgres(process.env.DATABASE_URL);

async function main() {
  console.log("Cleaning dirty tweets in PostgreSQL...");

  const rows = await sql`
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
