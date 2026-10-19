/**
 * Links: what a template or a slide may point at, and how it is written down.
 *
 * A link's address is a template string like any other — `{{url.record}}`,
 * `https://status.example.com/{{record.number}}` — so it is filled per record
 * and can come out as anything. Only addresses a reader can safely be sent to
 * are kept: web pages, mail and phone numbers, and paths on this instance
 * (made absolute, because a PDF has no instance to be relative to). A
 * `javascript:` address, or anything else, draws as plain text.
 */

const ALLOWED = /^(https?:\/\/|mailto:|tel:)/i;

/**
 * The address a link goes to, or null when it should not be one.
 *
 * `base` is the instance's own origin (`{{url.instance}}`); a path that starts
 * with `/` is resolved against it, and dropped when there is none.
 */
export function safeUrl(raw: string, base?: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (url.startsWith("//")) return null;
  if (url.startsWith("/")) return base ? `${base.replace(/\/+$/, "")}${url}` : null;
  if (ALLOWED.test(url)) return url;
  // A bare host — `www.example.com/page` — is a web page.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(url)) return `https://${url}`;
  return null;
}

/**
 * An address as PDF can store it: seven-bit ASCII, with anything else
 * percent-encoded. A URI action's string is bytes, not text, and a reader
 * hands those bytes to the browser as they are.
 */
export function asciiUrl(url: string): string {
  let out = "";
  for (const char of url) {
    const code = char.codePointAt(0)!;
    out += code > 0x20 && code < 0x7f ? char : encodeURIComponent(char);
  }
  return out;
}

/** The form of a record on this instance, as a link. */
export const recordUrl = (base: string, table: string, sysId: string): string =>
  `${base.replace(/\/+$/, "")}/${encodeURIComponent(table)}.do?sys_id=${encodeURIComponent(sysId)}`;
