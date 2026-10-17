/**
 * Token substitution, with no opinion about what is being rendered.
 *
 * Ported from the cpq-vibes text renderer (src/lib/document.ts). A template
 * is text with `{{token}}` holes in it; this file fills them and reports the
 * ones it could not. What a token *means* lives in the vocabulary
 * (./vocabulary.ts) — here a token is only a name and a string.
 *
 * Rendering substitutes strings and nothing else: there is no expression
 * evaluation, no template language to escape out of, and nothing in a template
 * can reach a record beyond the fields its tokens name.
 */

/** A token and the sentence the editor shows beside it. */
export type TokenDescription = { token: string; description: string };

/**
 * `{{record.caller_id.email}}` — letters, digits, underscores and dots.
 *
 * The dots are what make dot-walking work: everything after `record.` is a
 * field path the Table API understands as it is.
 */
export const TOKEN_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/g;

/**
 * Substitutes tokens into one string, collecting the ones the values do not
 * know so a caller can warn about them.
 *
 * Deliberately `replace` with a function rather than a string: a value
 * containing `$&` would otherwise be read as a replacement pattern and corrupt
 * the document, and record data is exactly where a stray `$` turns up.
 */
export function fillTokens(text: string, values: Record<string, string>, unknown?: Set<string>): string {
  return text.replace(TOKEN_PATTERN, (_match, token: string) => {
    const value = values[token];
    if (value === undefined) {
      unknown?.add(token);
      // A blank, not the raw token: an unresolved `{{foo}}` in a document that
      // leaves the building is worse than a gap the author will see in preview.
      return "";
    }
    return value;
  });
}

/** Every token a piece of text uses, in order of first appearance. */
export function tokensIn(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(TOKEN_PATTERN)) found.add(match[1]!);
  return [...found];
}

/** "Incident INC0010001" -> "incident-inc0010001.pdf" */
export function documentFileName(name: string, fallback = "document"): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || fallback;
  return `${slug}.pdf`;
}
