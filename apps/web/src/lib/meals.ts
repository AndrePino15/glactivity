/** "chicken, rice\nbroccoli" → ["chicken", "rice", "broccoli"] */
export function parseIngredients(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => {
      const key = s.toLowerCase();
      if (!s || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim().replace(/(es|s)$/, "");

/** Ingredients not already on the shopping list ("Eggs" matches "egg"). */
export function missingIngredients(onList: string[], ingredients: string[]): string[] {
  const have = new Set(onList.map(normalise));
  const out: string[] = [];
  for (const item of ingredients) {
    const key = normalise(item);
    if (!have.has(key)) {
      have.add(key);
      out.push(item);
    }
  }
  return out;
}
