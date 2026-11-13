// Public publication read layer for the OpenRouter Decision Models reference board.
import type { LbDecisionsBoardResponse } from "@aihot/contracts/leaderboard";
import { loadOpenRouterDecisions } from "../leaderboard/openrouter-decisions.ts";

export async function readDecisionsBoard(): Promise<LbDecisionsBoardResponse> {
  return loadOpenRouterDecisions();
}
