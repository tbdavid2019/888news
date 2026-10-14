// Podcast AI Intelligence & CLEF/JEV evaluation pipeline.
import { sql } from "../db.ts";
import { evaluateWithDecisionEngine, isDecisionEngineAvailable } from "../providers/jev.ts";
import { ENTITIES } from "@aihot/industry/taxonomy";

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
  // Pass items with score >= 35 are selected for featured recommend feed
  const selected = decision.label !== "BLOCK" && decision.score >= 35;
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
  if (!isDecisionEngineAvailable()) {
    return {
      label: "PASS",
      score: 50,
      selected: true,
      category: "ai-tech",
      authorRole: "observer",
    };
  }

  const decision = await evaluateWithDecisionEngine(
    {
      title: ep.title,
      bodyText: ep.showNotes,
    },
    {
      purpose: "podcast_selection",
      subject: `podcast:${ep.id}`,
    }
  );

  const result = evalPodcastDecisionLogic(decision);

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
