// Podcast AI evaluation pipeline (standard LLM via chatJson).
import { z } from "zod";
import { sql } from "../db.ts";
import { chatJson } from "../providers/llm.ts";
import { modelFor } from "./models.ts";
import { ENTITIES } from "@aihot/industry/taxonomy";

const PodcastEvalSchema = z.object({
  label: z.preprocess((v) => String(v ?? "PASS").trim().toUpperCase(), z.enum(["PASS", "BLOCK", "UNKNOWN"])).catch("PASS"),
  score: z.coerce.number().min(0).max(100).catch(50),
  category: z.string().nullable().optional().catch(null),
  authorRole: z.enum(["principal", "observer", "relayer"]).nullable().optional().catch("observer"),
});

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
  const model = await modelFor("score");
  const res = await chatJson({
    model,
    purpose: "podcast_selection",
    subject: `podcast:${ep.id}`,
    promptVersion: "podcast-eval-v1",
    system: "Evaluate whether this podcast episode is relevant to the tech/AI industry and score its editorial value from 0 to 100. Return JSON with fields: label (PASS, BLOCK, or UNKNOWN), score (0-100), category (string or null), authorRole (principal, observer, relayer, or null).",
    user: `Title: ${ep.title}\n\nShow notes:\n${ep.showNotes.slice(0, 8000)}`,
    schema: PodcastEvalSchema,
    temperature: 0,
    maxTokens: 256,
  });

  const result = evalPodcastDecisionLogic({
    label: res.data.label,
    score: Math.round(res.data.score),
    category: res.data.category ?? null,
    authorRole: res.data.authorRole ?? null,
  });

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
        INSERT INTO podcast_episode_tickers (
          episode_id, ticker, entity_id, mention_context, created_at
        ) VALUES (
          ${episodeId}, ${def.ticker.symbol}, ${entityId}, ${def.name}, now()
        )
        ON CONFLICT (episode_id, ticker) DO NOTHING
      `;
    }
  }

  return matchedTickers;
}
