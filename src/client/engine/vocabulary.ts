/**
 * What a token means.
 *
 * In cpq-vibes a vocabulary was a closed list per record kind. Here the record
 * can come from any table, so the vocabulary is open in one place and closed
 * everywhere else:
 *
 * | Token                         | Value                                           |
 * | ----------------------------- | ----------------------------------------------- |
 * | `{{record.<path>}}`           | a field's display value; dot-walks (`caller_id.email`) |
 * | `{{raw.<path>}}`              | the same field's stored value                   |
 * | `{{table.label}}` / `.name`   | the record's table                              |
 * | `{{now.date}}` / `.datetime`  | when the document was rendered                  |
 * | `{{user.name}}` / `.email`    | who rendered it                                 |
 * | `{{deck.title}}` / `.count` / `.index` | the batch the record is part of        |
 * | `{{list.count}}`              | inside a related list's title: rows matched     |
 * | `{{url.record}}` / `.instance` | the record's form, and the instance, as links  |
 *
 * A record field the Table API does not return is unknown, and an unknown
 * token renders blank and is reported — exactly the original's rule.
 *
 * Security is the platform's, not this file's: every field is fetched with the
 * viewer's own session, so a field their ACLs hide comes back empty and a
 * template cannot reach past what its reader could already open.
 */
import { tokensIn, type TokenDescription } from "./tokens";
import { relatedBlocks, templateStrings, type PdfTemplate } from "./template";

/** A field of a table, as the schema endpoint describes it. */
export type SchemaField = {
  name: string;
  label: string;
  type: string;
  /** The referenced table, for a reference field. */
  reference?: string;
};

/** The tokens every template can use whatever its table. */
export const CONTEXT_TOKENS: TokenDescription[] = [
  { token: "table.label", description: "The record's table, as people read it" },
  { token: "table.name", description: "The record's table, as the system names it" },
  { token: "now.date", description: "Today's date" },
  { token: "now.datetime", description: "The date and time the document was made" },
  { token: "user.name", description: "Who made the document" },
  { token: "user.email", description: "Their email address" },
  { token: "deck.title", description: "The template's name, or the deck's title" },
  { token: "deck.count", description: "How many records are in the document" },
  { token: "deck.index", description: "This record's position: 1, 2, 3…" },
  { token: "url.record", description: "A link to the record's form on the instance" },
  { token: "url.instance", description: "The instance's address, for links of your own" },
];

export const LIST_TOKENS: TokenDescription[] = [
  { token: "list.count", description: "In a related list's title: how many rows matched" },
];

/** The record and raw tokens for a table's fields. */
export function fieldTokens(fields: SchemaField[]): TokenDescription[] {
  return fields.map(field => ({
    token: `record.${field.name}`,
    description: field.reference ? `${field.label} → ${field.reference}` : field.label,
  }));
}

/* ------------------------------ field paths ------------------------------ */

const RECORD_PREFIX = "record.";
const RAW_PREFIX = "raw.";

/** The field path behind a record or raw token, or null for any other token. */
export function fieldPathOf(token: string): string | null {
  if (token.startsWith(RECORD_PREFIX)) return token.slice(RECORD_PREFIX.length) || null;
  if (token.startsWith(RAW_PREFIX)) return token.slice(RAW_PREFIX.length) || null;
  return null;
}

/**
 * Every field path a template reads off the record itself.
 *
 * This is what decides which fields are fetched: a template that prints six
 * fields asks for six, not for the two hundred on `incident`.
 */
export function recordFieldPaths(template: PdfTemplate): string[] {
  const paths = new Set<string>(["sys_id"]);
  for (const text of templateStrings(template)) {
    for (const token of tokensIn(text)) {
      const path = fieldPathOf(token);
      if (path) paths.add(path);
    }
  }
  return [...paths];
}

/**
 * A fingerprint of everything a template needs fetched.
 *
 * The editor compares these rather than templates: typing in a heading
 * changes the template on every keystroke but changes what has to be fetched
 * only when a new field token appears.
 */
export function dataSignature(template: PdfTemplate): string {
  return JSON.stringify([recordFieldPaths(template).sort(), relatedBlocks(template).map(block => block.table + block.field)]);
}

/* -------------------------------- values --------------------------------- */

/** One field as the Table API returns it with `sysparm_display_value=all`. */
export type ApiField = { value?: unknown; display_value?: unknown } | string | null | undefined;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

/**
 * A display value as text a PDF can draw.
 *
 * HTML fields come back as markup; a PDF has no markup, so block-level tags
 * become line breaks, everything else is dropped, and entities are decoded.
 */
export function plainText(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (!/[<&]/.test(text)) return text;
  return text
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+|#39);/gi, (match, name: string) => {
      const key = name.toLowerCase();
      if (ENTITIES[key] !== undefined) return ENTITIES[key]!;
      if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2), 16));
      if (key.startsWith("#")) return String.fromCodePoint(parseInt(key.slice(1), 10));
      return match;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const displayOf = (field: ApiField): string =>
  field && typeof field === "object" ? plainText(field.display_value ?? field.value ?? "") : plainText(field ?? "");

const rawOf = (field: ApiField): string =>
  field && typeof field === "object" ? String(field.value ?? "") : String(field ?? "");

/**
 * The record and raw tokens for one record.
 *
 * Only the paths the API actually returned are set; a path it did not return
 * is not a field on that table, and leaving it unset is what makes the token
 * report as unknown instead of rendering blank in silence.
 */
export function recordValues(record: Record<string, ApiField>, paths: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const path of paths) {
    if (!(path in record)) continue;
    values[`${RECORD_PREFIX}${path}`] = displayOf(record[path]);
    values[`${RAW_PREFIX}${path}`] = rawOf(record[path]);
  }
  return values;
}

/** A related list's row, with display values only — a table cell is read, not computed with. */
export function rowValues(row: Record<string, ApiField>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, field] of Object.entries(row)) values[key] = displayOf(field);
  return values;
}

/* ------------------------------- specimens ------------------------------- */

/** The label a field path reads as: its own label, or the walk to it. */
export function pathLabel(path: string, fields: SchemaField[]): string {
  const [first, ...rest] = path.split(".");
  const field = fields.find(entry => entry.name === first);
  if (!field) return path;
  return rest.length ? `${field.label} › ${rest.join(" › ")}` : field.label;
}

/**
 * Stand-in values for a template with no record behind it yet.
 *
 * Each field renders as its own label in angle quotes, so a preview drawn
 * before anyone picks a record still shows where everything goes — and a path
 * that is not on the table still shows up as unknown.
 */
export function specimenValues(paths: string[], fields: SchemaField[]): Record<string, string> {
  const known = new Set(fields.map(field => field.name));
  const values: Record<string, string> = {};
  for (const path of paths) {
    if (!known.has(path.split(".")[0]!)) continue;
    values[`${RECORD_PREFIX}${path}`] = `‹${pathLabel(path, fields)}›`;
    values[`${RAW_PREFIX}${path}`] = `‹${path}›`;
  }
  return values;
}
