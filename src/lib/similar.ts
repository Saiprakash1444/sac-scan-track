/**
 * Fuzzy "is this part already catalogued?" check for the Add a part form.
 * Runs client-side over the inventory that's already cached — the catalogue is
 * a few hundred rows, so no index or server round trip is needed.
 */

const STOP = new Set([
  "module",
  "board",
  "the",
  "a",
  "an",
  "of",
  "for",
  "with",
  "and",
  "pcs",
  "piece",
]);

function normalise(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
}

function tokens(text: string) {
  return normalise(text)
    .split(" ")
    .filter((t) => t && !STOP.has(t));
}

/** Character bigrams of the name with spaces removed: "L298N" ≈ "l298n driver". */
function bigrams(text: string) {
  const compact = normalise(text).replace(/ /g, "");
  const grams = new Map<string, number>();
  for (let i = 0; i < compact.length - 1; i++) {
    const g = compact.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  return { grams, size: Math.max(0, compact.length - 1), compact };
}

function dice(a: ReturnType<typeof bigrams>, b: ReturnType<typeof bigrams>) {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const [g, n] of a.grams) overlap += Math.min(n, b.grams.get(g) ?? 0);
  return (2 * overlap) / (a.size + b.size);
}

/** 0..1 — how likely `typed` names the same kind of part as `existing`. */
export function similarity(typed: string, existing: string): number {
  const ta = tokens(typed);
  const tb = tokens(existing);
  if (ta.length === 0 || tb.length === 0) return 0;

  const ba = bigrams(typed);
  const bb = bigrams(existing);
  if (ba.compact === bb.compact) return 1;

  // Part numbers ("l298n", "ds18b20", "18650") are the strongest signal: a shared
  // token with a digit in it almost always means the same part.
  const setB = new Set(tb);
  const shared = ta.filter((t) => setB.has(t));
  const sharedCode = shared.some((t) => /\d/.test(t) && t.length >= 3);

  const tokenScore = shared.length / Math.min(ta.length, tb.length);
  // Containment only means something when the shorter name isn't a fragment like "90".
  const contains =
    Math.min(ba.compact.length, bb.compact.length) >= 4 &&
    (bb.compact.includes(ba.compact) || ba.compact.includes(bb.compact));

  return Math.max(dice(ba, bb), tokenScore * 0.9, contains ? 0.85 : 0, sharedCode ? 0.9 : 0);
}

export function findSimilar<T extends { name: string; keywords?: string[] | null }>(
  typed: string,
  items: T[],
  { threshold = 0.6, limit = 3 } = {},
): T[] {
  if (normalise(typed).replace(/ /g, "").length < 3) return [];
  return items
    .map((item) => ({
      item,
      score: Math.max(
        similarity(typed, item.name),
        // Keywords are often generic ("nano", "motor"), so only an exact hit or a
        // shared part number counts.
        ...(item.keywords ?? []).map((k) =>
          similarity(typed, k) === 1 || (/\d/.test(k) && similarity(typed, k) >= 0.85) ? 0.8 : 0,
        ),
      ),
    }))
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.item);
}
