/**
 * Pure helpers that turn ATS board data into Posting fields: HTML job
 * descriptions into plain text, and location text into the `remote` flag.
 */

const namedEntities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
};

/**
 * Decodes HTML entities in one pass, so `&amp;lt;` becomes `&lt;` (not `<`).
 * Unknown named entities are left as written.
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return namedEntities[body.toLowerCase()] ?? match;
  });
}

/**
 * Turns an ATS job description into readable plain text. Greenhouse sends the
 * HTML itself entity-escaped (`&lt;p&gt;`), so entities are decoded once to
 * recover the markup and once more, after the tags are gone, for the text.
 * Block elements become line breaks and list items get a bullet.
 */
export function htmlToText(html: string): string {
  const markup = decodeEntities(html);
  const text = markup
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|h[1-6]|ul|ol|li|tr|table|section|blockquote)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[\s ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Whether a Posting's location says the role can be done remotely. Parsed
 * from the board's free-text location ("US - Remote", "Remote-Friendly",
 * "San Francisco (or Remote U.S.)"), which is the only remote signal the
 * public boards expose consistently.
 */
export function isRemote(location: string): boolean {
  return /\bremote\b/i.test(location);
}
