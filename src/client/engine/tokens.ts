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
 *
 * ## Formatters
 *
 * A token can be followed by formatters, each a name and perhaps one or two
 * arguments, applied left to right:
 *
 *     {{record.opened_at | date:"d MMM yyyy"}}
 *     {{record.short_description | truncate:60 | upper}}
 *     {{record.assigned_to | default:"Unassigned"}}
 *
 * They are a closed list (`FORMATTERS`) of plain string functions — still no
 * expressions — and an unknown one leaves the value as it was.
 */

/** A token and the sentence the editor shows beside it. */
export type TokenDescription = { token: string; description: string };

/**
 * `{{record.caller_id.email}}` — letters, digits, underscores and dots.
 *
 * The dots are what make dot-walking work: everything after `record.` is a
 * field path the Table API understands as it is.
 */
export const TOKEN_PATTERN =
  /\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*((?:\|\s*[A-Za-z]+(?:\s*:\s*(?:"[^"]*"|'[^']*'|[^|}\s]+)(?:\s*,\s*(?:"[^"]*"|'[^']*'|[^|},\s]+))?)?\s*)*)\}\}/g;

/**
 * Substitutes tokens into one string, collecting the ones the values do not
 * know so a caller can warn about them.
 *
 * Deliberately `replace` with a function rather than a string: a value
 * containing `$&` would otherwise be read as a replacement pattern and corrupt
 * the document, and record data is exactly where a stray `$` turns up.
 */
export function fillTokens(
  text: string,
  values: Record<string, string>,
  unknown?: Set<string>,
  options: { keepUnknown?: boolean } = {},
): string {
  return text.replace(TOKEN_PATTERN, (match, token: string, filters: string) => {
    const value = values[token];
    if (value === undefined) {
      if (options.keepUnknown) return match;
      unknown?.add(token);
    }
    // A blank, not the raw token: an unresolved `{{foo}}` in a document that
    // leaves the building is worse than a gap the author will see in preview.
    return filters ? applyFormatters(value ?? "", filters, token, values) : (value ?? "");
  });
}

/* ------------------------------- formatters ------------------------------ */

type Formatter = (value: string, args: string[], context: { raw?: string }) => string;

let formatLocale: string | undefined;

/** The locale numbers and dates are formatted in: the browser's, unless set (tests set one). */
export function setFormatLocale(locale: string | undefined): void {
  formatLocale = locale;
}

const MONTHS = (style: "long" | "short") =>
  Array.from({ length: 12 }, (_, month) =>
    new Intl.DateTimeFormat(formatLocale, { month: style, timeZone: "UTC" }).format(Date.UTC(2020, month, 1)),
  );
const WEEKDAYS = (style: "long" | "short") =>
  Array.from({ length: 7 }, (_, day) =>
    new Intl.DateTimeFormat(formatLocale, { weekday: style, timeZone: "UTC" }).format(Date.UTC(2020, 5, 7 + day)),
  );

/**
 * A date or date-time, read: the stored form (`2026-03-01 14:30:00`, which the
 * instance keeps in UTC) or anything the browser reads as a date.
 */
function readDateTime(text: string): Date | null {
  const stored = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text.trim());
  if (stored) {
    const [, y, mo, d, h, mi, sec] = stored;
    // A date alone is a day, not a moment: kept at midnight where it is read, so it does not move a day.
    if (h === undefined) return new Date(Number(y), Number(mo) - 1, Number(d));
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec ?? 0)));
  }
  if (!text.trim()) return null;
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/**
 * `d MMM yyyy`, `yyyy-MM-dd HH:mm`, `EEEE`: the usual pattern letters. Other
 * characters are kept as they are; quote words — `'at'` — so their letters are too.
 */
function formatDate(date: Date, pattern: string): string {
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  const hours = date.getHours();
  const parts: Record<string, () => string> = {
    yyyy: () => String(date.getFullYear()),
    yy: () => pad(date.getFullYear() % 100),
    MMMM: () => MONTHS("long")[date.getMonth()]!,
    MMM: () => MONTHS("short")[date.getMonth()]!,
    MM: () => pad(date.getMonth() + 1),
    M: () => String(date.getMonth() + 1),
    dd: () => pad(date.getDate()),
    d: () => String(date.getDate()),
    EEEE: () => WEEKDAYS("long")[date.getDay()]!,
    EEE: () => WEEKDAYS("short")[date.getDay()]!,
    HH: () => pad(hours),
    H: () => String(hours),
    hh: () => pad(hours % 12 || 12),
    h: () => String(hours % 12 || 12),
    mm: () => pad(date.getMinutes()),
    ss: () => pad(date.getSeconds()),
    a: () => (hours < 12 ? "AM" : "PM"),
  };
  return pattern.replace(/yyyy|yy|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|hh|h|mm|ss|a|'[^']*'/g, part =>
    part.startsWith("'") ? part.slice(1, -1) : parts[part]!(),
  );
}

const readNumber = (text: string): number | null => {
  const cleaned = text
    .replace(/[\s,]/g, "")
    .replace(/^[^\d+\-.]+/, "")
    .replace(/%$/, "");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(cleaned)) return null;
  return Number(cleaned);
};

/** A duration's stored form (`1970-01-03 04:05:00`: two days and four hours) or a number of seconds. */
function readSeconds(text: string): number | null {
  const stored = /^1970-01-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text.trim());
  if (stored) {
    const [, d, h, m, sec] = stored.map(Number) as number[];
    return (d! - 1) * 86_400 + h! * 3600 + m! * 60 + sec!;
  }
  return readNumber(text);
}

/** The formatters a token can use, by name. Each turns a string into a string. */
export const FORMATTERS: Record<string, { describe: string; example: string; apply: Formatter }> = {
  upper: { describe: "In capitals", example: "upper", apply: value => value.toLocaleUpperCase(formatLocale) },
  lower: { describe: "In small letters", example: "lower", apply: value => value.toLocaleLowerCase(formatLocale) },
  title: {
    describe: "Each word capitalised",
    example: "title",
    apply: value =>
      value
        .toLocaleLowerCase(formatLocale)
        .replace(/(^|[\s-])(\p{L})/gu, (_, gap, letter: string) => gap + letter.toLocaleUpperCase(formatLocale)),
  },
  trim: { describe: "Without spaces at either end", example: "trim", apply: value => value.trim() },
  default: {
    describe: "This text when the value is empty",
    example: 'default:"None"',
    apply: (value, [fallback = ""]) => (value.trim() ? value : fallback),
  },
  truncate: {
    describe: "At most this many characters, ending in …",
    example: "truncate:60",
    apply: (value, [length = "80"]) => {
      const most = Math.max(1, Number(length) || 80);
      return [...value].length > most
        ? `${[...value]
            .slice(0, most - 1)
            .join("")
            .trimEnd()}…`
        : value;
    },
  },
  date: {
    describe: "A date in this pattern",
    example: 'date:"d MMM yyyy"',
    apply: (value, [pattern = "d MMM yyyy"], { raw }) => {
      const date = readDateTime(raw ?? "") ?? readDateTime(value);
      return date ? formatDate(date, pattern) : value;
    },
  },
  number: {
    describe: "A number, grouped, with this many decimals",
    example: "number:2",
    apply: (value, [decimals], { raw }) => {
      const figure = readNumber(raw ?? "") ?? readNumber(value);
      if (figure === null) return value;
      const places = decimals === undefined ? undefined : Math.max(0, Math.min(10, Number(decimals) || 0));
      return new Intl.NumberFormat(formatLocale, {
        minimumFractionDigits: places,
        maximumFractionDigits: places ?? 3,
      }).format(figure);
    },
  },
  duration: {
    describe: "A duration as days, hours and minutes",
    example: "duration",
    apply: (value, _args, { raw }) => {
      const seconds = readSeconds(raw ?? "") ?? readSeconds(value);
      if (seconds === null) return value;
      const days = Math.floor(seconds / 86_400);
      const hours = Math.floor((seconds % 86_400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const parts = [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`].filter(Boolean);
      return parts.length ? parts.join(" ") : `${Math.round(seconds)}s`;
    },
  },
  yesno: {
    describe: "Two words for true and false",
    example: 'yesno:"Yes","No"',
    apply: (value, [yes = "Yes", no = "No"], { raw }) => {
      const truth = (raw ?? value).trim().toLowerCase();
      return truth === "true" || truth === "1" ? yes : truth === "false" || truth === "0" || truth === "" ? no : value;
    },
  },
};

const FILTER_PART = /\|\s*([A-Za-z]+)(?:\s*:\s*("[^"]*"|'[^']*'|[^|}\s,]+)(?:\s*,\s*("[^"]*"|'[^']*'|[^|},\s]+))?)?/g;

const unquote = (text: string | undefined): string | undefined =>
  text === undefined ? undefined : /^(["']).*\1$/.test(text) ? text.slice(1, -1) : text;

/** The formatters after a token, applied in order. A `record.` token's formatters also see its stored value. */
function applyFormatters(value: string, filters: string, token: string, values: Record<string, string>): string {
  const raw = token.startsWith("record.") ? values[`raw.${token.slice(7)}`] : undefined;
  let out = value;
  for (const match of filters.matchAll(FILTER_PART)) {
    const formatter = FORMATTERS[match[1]!.toLowerCase()];
    if (!formatter) continue;
    const args = [unquote(match[2]), unquote(match[3])].filter((arg): arg is string => arg !== undefined);
    // Only the first formatter reads the stored value: after that, the value has been changed on purpose.
    out = formatter.apply(out, args, { raw: out === value ? raw : undefined });
  }
  return out;
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
