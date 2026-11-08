// Accent-free, case-free text matching for the search boxes, so "banh dau" finds "Bánh dâu".

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function queryWords(query: string): string[] {
  return normalizeText(query).split(" ").filter(Boolean);
}

// A score for how well the words match, or 0 when some word is missing.
// "fields" go from most to least important (e.g. name, then flavors, then description).
export function matchScore(words: string[], fields: (string | null | undefined)[]): number {
  if (words.length === 0) return 0;
  const texts = fields.map((field) => normalizeText(field ?? ""));
  let score = 0;
  for (const word of words) {
    let best = 0;
    texts.forEach((text, index) => {
      if (!text.includes(word)) return;
      const weight = fields.length - index; // earlier fields count more
      const startsWord = text.startsWith(word) || text.includes(` ${word}`);
      best = Math.max(best, weight * (startsWord ? 3 : 1));
    });
    if (best === 0) return 0;
    score += best;
  }
  return score;
}
