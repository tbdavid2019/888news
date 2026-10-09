// Conservative source budget leaves room for rubric, title and CLEF templates
// inside the 4096-token input window. ASCII costs at most one token per byte;
// reserve four tokens per non-ASCII code point, including emoji.
export function splitDecisionMaterial(text: string, budget = 1500): string[] {
  if (budget < 4) throw new Error("Decision material budget must be at least four");
  const parts: string[] = [];
  let part = "";
  let units = 0;
  for (const ch of text) {
    const cost = ch.codePointAt(0)! < 128 ? 1 : 4;
    if (units + cost > budget) {
      parts.push(part);
      part = "";
      units = 0;
    }
    part += ch;
    units += cost;
  }
  if (part) parts.push(part);
  return parts;
}

export function decisionEvidence(body: string, fragments: Array<{ text: string; relevance: number }>): string {
  const opening = splitDecisionMaterial(body, 300)[0] ?? "";
  const ranked = [...fragments].sort((a, b) => b.relevance - a.relevance).slice(0, 2);
  // Give both excerpts space, rather than letting the first consume the budget.
  return [opening, ...ranked.map((p) => splitDecisionMaterial(p.text, 500)[0] ?? "")].join("\n\n[Source excerpt]\n\n");
}

export function belowDecisionCutoff(rawGrade: number | undefined, displayScore: number, cutoff: number): boolean {
  return rawGrade !== undefined && Number.isFinite(rawGrade)
    ? rawGrade < cutoff * 3 / 100
    : displayScore < cutoff; // Historic analyses lack the native grade.
}
