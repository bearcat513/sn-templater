/**
 * TrueType, read and subset — just enough to embed a font in a PDF.
 *
 * The standard 14 fonts the writer otherwise uses cover Latin-1 and nothing
 * else (see ../pdfFonts.ts). For text beyond that — Greek, Cyrillic, Central
 * European names, the odd symbol — the writer embeds a TrueType font as a
 * CID font, and this file is what reads one: the character map, to find a
 * character's glyph; the metrics, to measure it; and the glyph outlines, to
 * copy the ones a document uses into a subset.
 *
 * ## The subset
 *
 * A subset keeps every glyph's *number* and empties the glyphs that are not
 * used, rather than renumbering the ones that are. The PDF then names glyphs
 * by their number in the original font (`/CIDToGIDMap /Identity`), a
 * composite glyph's references to its parts stay valid as they are, and the
 * only cost is a short index entry per unused glyph. Only the tables a PDF
 * reader needs to draw TrueType outlines are kept; the character map is not
 * one of them, because the content stream already speaks in glyph numbers.
 *
 * No hinting, kerning or shaping: Latin, Greek and Cyrillic set well without
 * them at the sizes a document uses.
 */

type Table = { offset: number; length: number };

/** The tables a PDF reader uses to draw TrueType glyphs, in the order they are written. */
const SUBSET_TABLES = ["cvt ", "fpgm", "glyf", "head", "hhea", "hmtx", "loca", "maxp", "prep"];

/* Composite glyph flags (the `glyf` table). */
const ARG_1_AND_2_ARE_WORDS = 0x0001;
const WE_HAVE_A_SCALE = 0x0008;
const MORE_COMPONENTS = 0x0020;
const WE_HAVE_AN_X_AND_Y_SCALE = 0x0040;
const WE_HAVE_A_TWO_BY_TWO = 0x0080;

export class TrueTypeFont {
  readonly unitsPerEm: number;
  readonly ascent: number;
  readonly descent: number;
  readonly capHeight: number;
  readonly italicAngle: number;
  readonly bbox: [number, number, number, number];
  readonly numGlyphs: number;
  /** The PostScript name, from the `name` table: what the PDF calls the font. */
  readonly postScriptName: string;

  private readonly view: DataView;
  private readonly tables = new Map<string, Table>();
  private readonly advances: Uint16Array;
  private readonly glyphOffsets: Uint32Array;
  private readonly cmap = new Map<number, number>();

  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = this.view.getUint32(0);
    if (version !== 0x00010000 && version !== 0x74727565) throw new Error("Not a TrueType font.");

    const count = this.view.getUint16(4);
    for (let index = 0; index < count; index++) {
      const at = 12 + index * 16;
      this.tables.set(this.tag(at), { offset: this.view.getUint32(at + 8), length: this.view.getUint32(at + 12) });
    }
    for (const required of ["head", "hhea", "hmtx", "maxp", "loca", "glyf", "cmap"]) {
      if (!this.tables.has(required)) throw new Error(`The font has no ${required} table.`);
    }

    const head = this.table("head").offset;
    this.unitsPerEm = this.view.getUint16(head + 18);
    this.bbox = [
      this.view.getInt16(head + 36),
      this.view.getInt16(head + 38),
      this.view.getInt16(head + 40),
      this.view.getInt16(head + 42),
    ];
    const longOffsets = this.view.getInt16(head + 50) === 1;

    const hhea = this.table("hhea").offset;
    this.ascent = this.view.getInt16(hhea + 4);
    this.descent = this.view.getInt16(hhea + 6);
    const metrics = this.view.getUint16(hhea + 34);

    this.numGlyphs = this.view.getUint16(this.table("maxp").offset + 4);

    // Every glyph's advance: the last metric repeats for the glyphs past it.
    this.advances = new Uint16Array(this.numGlyphs);
    const hmtx = this.table("hmtx").offset;
    let last = 0;
    for (let glyph = 0; glyph < this.numGlyphs; glyph++) {
      if (glyph < metrics) last = this.view.getUint16(hmtx + glyph * 4);
      this.advances[glyph] = last;
    }

    this.glyphOffsets = new Uint32Array(this.numGlyphs + 1);
    const loca = this.table("loca").offset;
    for (let glyph = 0; glyph <= this.numGlyphs; glyph++) {
      this.glyphOffsets[glyph] = longOffsets
        ? this.view.getUint32(loca + glyph * 4)
        : this.view.getUint16(loca + glyph * 2) * 2;
    }

    const os2 = this.tables.get("OS/2");
    this.capHeight =
      os2 && this.view.getUint16(os2.offset) >= 2 ? this.view.getInt16(os2.offset + 88) : Math.round(this.ascent * 0.7);
    const post = this.tables.get("post");
    this.italicAngle = post ? this.view.getInt32(post.offset + 4) / 65536 : 0;
    this.postScriptName = this.readPostScriptName() ?? "Embedded";

    this.readCmap();
  }

  /** The glyph that draws a code point, or 0 — the font's "missing" glyph — when it has none. */
  glyphFor(codePoint: number): number {
    return this.cmap.get(codePoint) ?? 0;
  }

  /** Whether the font draws this code point at all. */
  has(codePoint: number): boolean {
    return this.cmap.has(codePoint);
  }

  /** A glyph's advance width, in 1/1000 em. */
  advance(glyph: number): number {
    return ((this.advances[glyph] ?? 0) * 1000) / this.unitsPerEm;
  }

  /** Scales a value in font units to 1/1000 em, as PDF font metrics are given. */
  scale(units: number): number {
    return Math.round((units * 1000) / this.unitsPerEm);
  }

  /**
   * A copy of the font with only these glyphs' outlines in it, and the parts
   * of any composite among them. Glyph 0 is always kept: a reader draws it
   * for anything it cannot find.
   */
  subset(glyphs: Iterable<number>): Uint8Array {
    const keep = new Set<number>([0]);
    const pending = [...glyphs];
    while (pending.length) {
      const glyph = pending.pop()!;
      if (glyph < 0 || glyph >= this.numGlyphs || keep.has(glyph)) continue;
      keep.add(glyph);
      pending.push(...this.components(glyph));
    }

    // glyf: the kept outlines, each padded to four bytes; loca: where each starts.
    const glyf = this.table("glyf").offset;
    const outlines: Uint8Array[] = [];
    const loca = new Uint32Array(this.numGlyphs + 1);
    let size = 0;
    for (let glyph = 0; glyph < this.numGlyphs; glyph++) {
      loca[glyph] = size;
      const start = this.glyphOffsets[glyph]!;
      const end = this.glyphOffsets[glyph + 1]!;
      if (!keep.has(glyph) || end <= start) continue;
      const outline = this.bytes.subarray(glyf + start, glyf + end);
      outlines.push(outline);
      size += outline.length;
      const pad = (4 - (outline.length % 4)) % 4;
      if (pad) {
        outlines.push(new Uint8Array(pad));
        size += pad;
      }
    }
    loca[this.numGlyphs] = size;

    const glyfTable = new Uint8Array(size);
    let at = 0;
    for (const part of outlines) {
      glyfTable.set(part, at);
      at += part.length;
    }
    const locaTable = new Uint8Array((this.numGlyphs + 1) * 4);
    const locaView = new DataView(locaTable.buffer);
    loca.forEach((offset, index) => locaView.setUint32(index * 4, offset));

    // head: long loca offsets now, and the whole-file checksum adjustment cleared until it is known.
    const head = this.copyTable("head");
    const headView = new DataView(head.buffer);
    headView.setUint32(8, 0);
    headView.setInt16(50, 1);

    const tables = new Map<string, Uint8Array>();
    for (const tag of SUBSET_TABLES) {
      if (tag === "glyf") tables.set(tag, glyfTable);
      else if (tag === "loca") tables.set(tag, locaTable);
      else if (tag === "head") tables.set(tag, head);
      else if (this.tables.has(tag)) tables.set(tag, this.copyTable(tag));
    }
    const file = writeFont(tables);
    // The adjustment makes the whole file's checksum come out to the magic number.
    const headAt = tableOffset(file, "head");
    new DataView(file.buffer).setUint32(headAt + 8, (0xb1b0afba - checksum(file)) >>> 0);
    return file;
  }

  /* -------------------------------- reading ------------------------------ */

  private tag(at: number): string {
    return String.fromCharCode(...this.bytes.subarray(at, at + 4));
  }

  private table(tag: string): Table {
    return this.tables.get(tag)!;
  }

  private copyTable(tag: string): Uint8Array {
    const { offset, length } = this.table(tag);
    return this.bytes.slice(offset, offset + length);
  }

  /** The glyphs a composite glyph is built from; none for a simple one. */
  private components(glyph: number): number[] {
    const start = this.glyphOffsets[glyph]!;
    if (this.glyphOffsets[glyph + 1]! <= start) return [];
    let at = this.table("glyf").offset + start;
    if (this.view.getInt16(at) >= 0) return [];
    at += 10;
    const parts: number[] = [];
    for (;;) {
      const flags = this.view.getUint16(at);
      parts.push(this.view.getUint16(at + 2));
      at += 4 + (flags & ARG_1_AND_2_ARE_WORDS ? 4 : 2);
      if (flags & WE_HAVE_A_SCALE) at += 2;
      else if (flags & WE_HAVE_AN_X_AND_Y_SCALE) at += 4;
      else if (flags & WE_HAVE_A_TWO_BY_TWO) at += 8;
      if (!(flags & MORE_COMPONENTS)) return parts;
    }
  }

  /** The Unicode character map: format 12 (all planes) when there is one, else format 4 (the first plane). */
  private readCmap() {
    const cmap = this.table("cmap").offset;
    const count = this.view.getUint16(cmap + 2);
    let format4 = -1;
    let format12 = -1;
    for (let index = 0; index < count; index++) {
      const at = cmap + 4 + index * 8;
      const platform = this.view.getUint16(at);
      const encoding = this.view.getUint16(at + 2);
      const offset = cmap + this.view.getUint32(at + 4);
      const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
      if (!unicode) continue;
      const format = this.view.getUint16(offset);
      if (format === 12) format12 = offset;
      if (format === 4) format4 = offset;
    }
    if (format12 !== -1) this.readFormat12(format12);
    else if (format4 !== -1) this.readFormat4(format4);
    else throw new Error("The font has no Unicode character map.");
  }

  private readFormat4(at: number) {
    const segments = this.view.getUint16(at + 6) / 2;
    const ends = at + 14;
    const starts = ends + segments * 2 + 2;
    const deltas = starts + segments * 2;
    const ranges = deltas + segments * 2;
    for (let segment = 0; segment < segments; segment++) {
      const end = this.view.getUint16(ends + segment * 2);
      const start = this.view.getUint16(starts + segment * 2);
      const delta = this.view.getInt16(deltas + segment * 2);
      const rangeAt = ranges + segment * 2;
      const range = this.view.getUint16(rangeAt);
      for (let code = start; code <= end && code !== 0xffff; code++) {
        let glyph: number;
        if (range === 0) glyph = (code + delta) & 0xffff;
        else {
          glyph = this.view.getUint16(rangeAt + range + (code - start) * 2);
          if (glyph) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph) this.cmap.set(code, glyph);
      }
    }
  }

  private readFormat12(at: number) {
    const groups = this.view.getUint32(at + 12);
    for (let group = 0; group < groups; group++) {
      const entry = at + 16 + group * 12;
      const start = this.view.getUint32(entry);
      const end = this.view.getUint32(entry + 4);
      const first = this.view.getUint32(entry + 8);
      for (let code = start; code <= end; code++) this.cmap.set(code, first + (code - start));
    }
  }

  /** Name ID 6, in the Windows Unicode record if there is one. */
  private readPostScriptName(): string | null {
    const name = this.tables.get("name");
    if (!name) return null;
    const count = this.view.getUint16(name.offset + 2);
    const strings = name.offset + this.view.getUint16(name.offset + 4);
    for (let index = 0; index < count; index++) {
      const at = name.offset + 6 + index * 12;
      if (this.view.getUint16(at + 6) !== 6) continue;
      const platform = this.view.getUint16(at);
      const length = this.view.getUint16(at + 8);
      const offset = strings + this.view.getUint16(at + 10);
      let text = "";
      if (platform === 3 || platform === 0) {
        for (let i = 0; i < length; i += 2) text += String.fromCharCode(this.view.getUint16(offset + i));
      } else {
        text = String.fromCharCode(...this.bytes.subarray(offset, offset + length));
      }
      // A PDF name: no spaces or delimiters.
      const clean = text.replace(/[^A-Za-z0-9_+-]/g, "");
      if (clean) return clean;
    }
    return null;
  }
}

/* -------------------------------- writing ------------------------------ */

const pad4 = (length: number) => (length + 3) & ~3;

function checksum(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sum = 0;
  const whole = bytes.length & ~3;
  for (let at = 0; at < whole; at += 4) sum = (sum + view.getUint32(at)) >>> 0;
  if (whole < bytes.length) {
    let tail = 0;
    for (let at = whole; at < whole + 4; at++) tail = (tail << 8) | (at < bytes.length ? bytes[at]! : 0);
    sum = (sum + (tail >>> 0)) >>> 0;
  }
  return sum;
}

/** An sfnt file of these tables, with its directory and checksums. */
function writeFont(tables: Map<string, Uint8Array>): Uint8Array {
  const tags = [...tables.keys()].sort();
  const count = tags.length;
  let power = 1;
  let log2 = 0;
  while (power * 2 <= count) {
    power *= 2;
    log2++;
  }
  const headerLength = 12 + count * 16;
  const total = headerLength + tags.reduce((sum, tag) => sum + pad4(tables.get(tag)!.length), 0);
  const file = new Uint8Array(total);
  const view = new DataView(file.buffer);
  view.setUint32(0, 0x00010000);
  view.setUint16(4, count);
  view.setUint16(6, power * 16);
  view.setUint16(8, log2);
  view.setUint16(10, count * 16 - power * 16);

  let offset = headerLength;
  tags.forEach((tag, index) => {
    const data = tables.get(tag)!;
    const entry = 12 + index * 16;
    for (let i = 0; i < 4; i++) view.setUint8(entry + i, tag.charCodeAt(i));
    view.setUint32(entry + 4, checksum(data));
    view.setUint32(entry + 8, offset);
    view.setUint32(entry + 12, data.length);
    file.set(data, offset);
    offset += pad4(data.length);
  });
  return file;
}

function tableOffset(file: Uint8Array, tag: string): number {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const count = view.getUint16(4);
  for (let index = 0; index < count; index++) {
    const entry = 12 + index * 16;
    if (String.fromCharCode(...file.subarray(entry, entry + 4)) === tag) return view.getUint32(entry + 8);
  }
  throw new Error(`No ${tag} table.`);
}
