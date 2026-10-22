/**
 * Render fixtures: a job for any template, with a value for every token it
 * uses and a few rows for every related list, so a golden render exercises
 * every block without an instance behind it.
 */
import { createHash } from "node:crypto";
import type { RenderJob } from "../render";
import { relatedBlocks, relatedKey, type PdfTemplate } from "../template";
import { recordFieldPaths } from "../vocabulary";

const CONTEXT: Record<string, string> = {
  "table.label": "Incident",
  "table.name": "incident",
  "now.date": "2026-01-02",
  "now.datetime": "2026-01-02 03:04:05",
  "user.name": "Ada Lovelace",
  "user.email": "ada@example.com",
  "deck.title": "Weekly review",
  "url.instance": "https://acme.service-now.com",
};

export function fixtureJob(template: PdfTemplate, records = 2): RenderJob {
  const paths = recordFieldPaths(template);
  const related = Object.fromEntries(
    relatedBlocks(template).map(block => {
      const rows = [1, 2, 3].map(index =>
        Object.fromEntries(block.columns.map(column => [column.field, `${column.field} ${index}`])),
      );
      return [relatedKey(block), { rows, total: rows.length }];
    }),
  );
  return {
    title: "Fixture",
    author: "Tests",
    subject: "Golden render",
    coverValues: { ...CONTEXT, "deck.count": String(records), "deck.index": "" },
    records: Array.from({ length: records }, (_, index) => ({
      label: `REC${index + 1}`,
      values: {
        ...CONTEXT,
        "deck.count": String(records),
        "deck.index": String(index + 1),
        "url.record": `https://acme.service-now.com/incident.do?sys_id=${index}`,
        ...Object.fromEntries(
          paths.flatMap(path => [
            [`record.${path}`, `${path} ${index + 1}`],
            [`raw.${path}`, path === "sys_id" ? `${index}`.padStart(32, "0") : `${path}-${index + 1}`],
          ]),
        ),
      },
      related,
    })),
  };
}

/** The text a PDF draws, in order: every `(…) Tj` string, unescaped. */
export function pdfText(bytes: Uint8Array): string[] {
  const source = Buffer.from(bytes).toString("latin1");
  const out: string[] = [];
  for (const match of source.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) out.push(match[1]!.replace(/\\(.)/g, "$1"));
  return out;
}

/**
 * A fingerprint of everything a PDF draws, positions included, without the
 * creation date: a layout change that leaves the text alone still shows.
 */
export function pdfLayoutDigest(bytes: Uint8Array): string {
  const source = Buffer.from(bytes)
    .toString("latin1")
    .replace(/\/CreationDate \([^)]*\)/, "");
  return createHash("sha256").update(source, "latin1").digest("hex").slice(0, 16);
}
