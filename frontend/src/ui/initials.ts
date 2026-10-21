/** "Ezekiel Baniaga" → "EB", "ezekiel.baniaga" → "EB", "zek" → "ZE", "admin" → "AD", "j" → "J". */
export function initials(name: string): string {
  const words = name
    .trim()
    // usernames allow [A-Za-z0-9._-]; split on those separators and on camelCase
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters = (w: string) => Array.from(w); // code points, not UTF-16 units
  if (words.length === 0) return "?";
  if (words.length === 1) return letters(words[0]).slice(0, 2).join("").toUpperCase();
  return (letters(words[0])[0] + letters(words[words.length - 1])[0]).toUpperCase();
}

/** The six pastel hues, by index; the CSS has one fixed class per index. */
export const HUE_COUNT = 6;

/** A stable index 0..5 for an id (not the username: a rename would change the color). */
export function hueFor(id: string): number {
  let hash = 0;
  for (const ch of id) hash = (Math.imul(hash, 31) + (ch.codePointAt(0) ?? 0)) >>> 0;
  return hash % HUE_COUNT;
}
