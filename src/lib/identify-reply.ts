/**
 * Turns the model's reply into a safe result. Never throws on bad output, clamps
 * every string, and only keeps an id that was in the catalogue we sent — the
 * model may guess what a part is, but it can never invent a database row.
 */
export function parseIdentifyReply(content: string, knownIds: Set<string>) {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = {};
      }
    }
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) parsed = {};

  const str = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

  const rawId = str(parsed.id);
  const componentId = rawId && knownIds.has(rawId) ? rawId : null;
  const confidence: "high" | "medium" | "low" =
    parsed.confidence === "high" || parsed.confidence === "medium"
      ? (parsed.confidence as "high" | "medium")
      : "low";
  const label = str(parsed.label, "Unrecognised part").slice(0, 90);

  return {
    componentId,
    label,
    category: str(parsed.category, "component").slice(0, 40),
    description: str(parsed.description).slice(0, 220),
    specs: Array.isArray(parsed.specs)
      ? parsed.specs.filter((s): s is string => typeof s === "string").slice(0, 4)
      : [],
    confidence,
    reason: str(parsed.reason).slice(0, 140),
    searchQuery: str(parsed.searchQuery, label).slice(0, 90),
  };
}
