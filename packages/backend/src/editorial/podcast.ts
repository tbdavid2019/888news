// Podcast AI evaluation pipeline (standard LLM via chatJson).
import { z } from "zod";
import { sql } from "../db.ts";
import { chatJson } from "../providers/llm.ts";
import { modelFor } from "./models.ts";
import { promptText, promptVersion } from "./prompts.ts";
import { ENTITIES } from "@aihot/industry/taxonomy";

const PodcastEvalSchema = z.object({
  label: z.preprocess((v) => String(v ?? "BLOCK").trim().toUpperCase(), z.enum(["PASS", "BLOCK", "UNKNOWN"])).catch("BLOCK"),
  score: z.coerce.number().min(0).max(100).catch(0),
});

const PODCAST_EVAL_SYSTEM = promptText("podcast-eval");
const PODCAST_EVAL_VERSION = promptVersion("podcast-eval");

function sanitizeTagContent(text: string): string {
  return text.replace(/<\/?(?:podcast_data|title|show_notes)>/gi, "");
}

export interface PodcastEvalResult {
  label: "PASS" | "BLOCK" | "UNKNOWN";
  score: number;
  selected: boolean;
  category: string | null;
  authorRole: "principal" | "observer" | "relayer" | null;
}

export function evalPodcastDecisionLogic(decision: {
  label: "PASS" | "BLOCK" | "UNKNOWN";
  score: number;
  category?: string | null;
  authorRole?: "principal" | "observer" | "relayer" | null;
}): PodcastEvalResult {
  // Pass items with score >= 60 are selected for featured recommend feed
  const selected = decision.label !== "BLOCK" && decision.score >= 60;
  return {
    label: decision.label,
    score: decision.score,
    selected,
    category: decision.category ?? null,
    authorRole: decision.authorRole ?? null,
  };
}

export async function evaluatePodcastEpisode(ep: {
  id: string;
  title: string;
  showNotes: string;
}): Promise<PodcastEvalResult> {
  let result: PodcastEvalResult;
  try {
    const model = await modelFor("podcast");
    const safeTitle = sanitizeTagContent(ep.title.slice(0, 500));
    const safeNotes = sanitizeTagContent(ep.showNotes.slice(0, 8000));
    const res = await chatJson({
      model,
      purpose: "podcast_selection",
      subject: `podcast:${ep.id}`,
      promptVersion: PODCAST_EVAL_VERSION,
      system: PODCAST_EVAL_SYSTEM,
      user: `<podcast_data>\n<title>\n${safeTitle}\n</title>\n<show_notes>\n${safeNotes}\n</show_notes>\n</podcast_data>`,
      schema: PodcastEvalSchema,
      temperature: 0,
      maxTokens: 128,
    });
    result = evalPodcastDecisionLogic({
      label: res.data.label,
      score: Math.round(res.data.score),
    });
  } catch (err) {
    console.warn(`[Podcast] evaluation failed closed for ${ep.id}:`, err instanceof Error ? err.message : String(err));
    result = evalPodcastDecisionLogic({ label: "BLOCK", score: 0 });
  }

  await sql`
    UPDATE podcast_episodes
    SET score = ${result.score},
        clef_label = ${result.label},
        selected = ${result.selected},
        updated_at = now()
    WHERE id = ${ep.id}
  `;

  return result;
}

export async function associateEntitiesAndTickers(
  episodeId: string,
  textToScan: string
): Promise<string[]> {
  const matchedTickers: string[] = [];
  const lower = textToScan.toLowerCase();

  for (const [entityId, def] of Object.entries(ENTITIES)) {
    let matched = lower.includes(def.name.toLowerCase());
    if (!matched) {
      for (const alias of def.aliases) {
        if (lower.includes(alias.toLowerCase())) {
          matched = true;
          break;
        }
      }
    }

    if (matched && def.ticker) {
      matchedTickers.push(def.ticker.symbol);
      await sql`
        INSERT INTO podcast_episode_tickers (episode_id, entity_id, ticker_symbol)
        VALUES (${episodeId}, ${entityId}, ${def.ticker.symbol})
        ON CONFLICT DO NOTHING
      `;
    }
  }

  return [...new Set(matchedTickers)];
}
