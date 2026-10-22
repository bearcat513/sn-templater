/**
 * The gallery — ready-made templates for the tables most instances live in.
 *
 * Each entry is a complete template record: what the Templates page lists,
 * what the form and list actions offer, and what the "New template" dialog
 * can start from. They are written against the base-system schema of each
 * table, so they render on an instance with nothing configured.
 *
 * This file is the single source for them. `npm run starters` turns it into
 * the Fluent records the app installs (src/fluent/templates/), so a template
 * changed here is changed on the instance at the next build and deploy.
 *
 * It imports nothing but types: the starter script loads it straight into
 * Node, without the bundler, and a value import would not resolve there.
 */
import type {
  ListColumn,
  PdfBlock,
  PdfPageSetup,
  PdfStyle,
  PdfTemplate,
  RelatedListBlock,
  TemplateKind,
} from "./template";

export type GalleryTemplate = {
  /** Stable: the record's `Now.ID` key is `starter-<key>`, so renaming one is a new record. */
  key: string;
  name: string;
  kind: TemplateKind;
  table: string;
  description: string;
  /** Which records a deck or batch export starts from. */
  query: string;
  orderBy: string;
  limit: number;
  body: PdfTemplate;
};

/* ------------------------------- house style ----------------------------- */

const INK = "#18181b";
const MUTED = "#71717a";

/** Paper for a document: A4, ten-point Helvetica, one accent colour. */
const paper = (accentColor: string): PdfPageSetup => ({
  size: "A4",
  margins: { top: 56, right: 48, bottom: 56, left: 48 },
  family: "helvetica",
  fontSize: 10,
  textColor: INK,
  mutedColor: MUTED,
  accentColor,
});

const paperStyle = (headerFill: string): PdfStyle => ({
  lineHeight: 1.35,
  paragraphSpacing: 4,
  headingScale: 1.9,
  ruleColor: "#d4d4d8",
  table: {
    headerFill,
    headerUppercase: true,
    zebra: "#fafafa",
    gridColor: "#e4e4e7",
    rowLines: true,
    cellPadding: 5,
  },
});

/** A 16:9 slide in one of two moods. */
const slide = (mood: "light" | "dark", accentColor: string): PdfPageSetup =>
  mood === "dark"
    ? {
        size: "Slide16x9",
        margins: { top: 48, right: 56, bottom: 44, left: 56 },
        family: "helvetica",
        fontSize: 16,
        textColor: "#e2e8f0",
        mutedColor: "#94a3b8",
        accentColor,
        background: "#0f172a",
      }
    : {
        size: "Slide16x9",
        margins: { top: 48, right: 56, bottom: 44, left: 56 },
        family: "helvetica",
        fontSize: 16,
        textColor: "#0f172a",
        mutedColor: "#64748b",
        accentColor,
        background: "#ffffff",
      };

const slideStyle = (mood: "light" | "dark"): PdfStyle => ({
  lineHeight: 1.3,
  paragraphSpacing: 8,
  headingScale: 2,
  ruleColor: mood === "dark" ? "#334155" : "#e2e8f0",
  table:
    mood === "dark"
      ? { headerFill: "#1e293b", headerColor: "#cbd5e1", gridColor: "#334155", rowLines: true, cellPadding: 6 }
      : { headerFill: "#f1f5f9", zebra: "#f8fafc", gridColor: "#e2e8f0", rowLines: true, cellPadding: 6 },
});

/* --------------------------------- pieces -------------------------------- */

const field = (label: string, name: string) => ({ label, value: `{{record.${name}}}` });

const column = (field: string, header: string, width: number, align?: ListColumn["align"]): ListColumn =>
  align ? { field, header, width, align } : { field, header, width };

/** The top of every document: a kicker, the record's own title, and a line of who and when. */
const masthead = (kicker: string, accent: string, title: string, meta: string): PdfBlock[] => [
  { type: "text", text: kicker, size: 8.5, bold: true, color: accent, spaceAfter: 3 },
  { type: "heading", text: title, size: 20, color: INK, spaceAfter: 4 },
  { type: "text", text: meta, size: 9.5, color: MUTED, spaceAfter: 14 },
];

const section = (title: string): PdfBlock => ({ type: "heading", text: title, size: 12, spaceAfter: 6 });

const related = (block: Omit<RelatedListBlock, "type">): RelatedListBlock => ({ type: "relatedList", ...block });

/** Who printed it and when, on every page; the page count is per record. */
const printedFooter = { text: "{{record.number}} · Printed {{now.datetime}} by {{user.name}}", showPageNumbers: true };

/** A title slide: what the deck is, how many records, when, and by whom. */
const titleSlide = (
  kicker: string,
  accent: string,
  subtitle: string,
  titleColor: string,
  muted: string,
): PdfBlock[] => [
  { type: "spacer", height: 104 },
  { type: "text", text: kicker, size: 14, bold: true, color: accent, spaceAfter: 6 },
  { type: "heading", text: "{{deck.title}}", size: 44, color: titleColor, spaceAfter: 8 },
  { type: "text", text: subtitle, size: 18, color: muted },
  { type: "spacer", height: 20 },
  { type: "divider", color: accent, thickness: 3 },
  { type: "text", text: "Prepared by {{user.name}}", size: 14, color: muted },
];

/* ------------------------------- incident -------------------------------- */

const INCIDENT_RED = "#be123c";

const incidentReport: GalleryTemplate = {
  key: "incident-report",
  name: "Incident report",
  kind: "document",
  table: "incident",
  description:
    "One incident as a PDF: who raised it, who owns it, what happened and how it was resolved, with its tasks, SLAs, affected CIs and child incidents.",
  query: "active=true",
  orderBy: "-opened_at",
  limit: 50,
  body: {
    page: paper(INCIDENT_RED),
    style: paperStyle("#fff1f2"),
    blocks: [
      ...masthead(
        "INCIDENT REPORT",
        INCIDENT_RED,
        "{{record.short_description}}",
        "{{record.number}} · Opened {{record.opened_at}} by {{record.opened_by}} via {{record.contact_type}}",
      ),
      {
        type: "stats",
        items: [field("Priority", "priority"), field("State", "state"), field("Category", "category")],
      },
      {
        type: "columns",
        columns: [
          { heading: "Caller", text: "{{record.caller_id}}\n{{record.caller_id.email}}\n{{record.caller_id.phone}}" },
          { heading: "Assignment", text: "{{record.assignment_group}}\n{{record.assigned_to}}" },
          { heading: "Service", text: "{{record.business_service}}\n{{record.cmdb_ci}}" },
        ],
      },
      { type: "divider" },
      {
        type: "fields",
        rows: [
          field("Impact", "impact"),
          field("Urgency", "urgency"),
          field("Subcategory", "subcategory"),
          field("Location", "location"),
          field("Parent incident", "parent_incident"),
          field("Last updated", "sys_updated_on"),
        ],
      },
      { type: "spacer", height: 6 },
      section("Description"),
      { type: "text", text: "{{record.description}}", spaceAfter: 12 },
      section("Resolution"),
      {
        type: "fields",
        rows: [
          field("Resolution code", "close_code"),
          field("Resolved by", "resolved_by"),
          field("Resolved", "resolved_at"),
          field("Resolution notes", "close_notes"),
        ],
      },
      { type: "spacer", height: 8 },
      related({
        title: "Incident tasks ({{list.count}})",
        table: "incident_task",
        field: "incident",
        orderBy: "number",
        limit: 50,
        columns: [
          column("number", "Number", 16),
          column("short_description", "Short description", 44),
          column("state", "State", 16),
          column("assigned_to", "Assigned to", 24),
        ],
        emptyText: "No incident tasks.",
      }),
      related({
        title: "SLAs ({{list.count}})",
        table: "task_sla",
        field: "task",
        orderBy: "start_time",
        limit: 20,
        columns: [
          column("sla", "SLA", 30),
          column("stage", "Stage", 14),
          column("has_breached", "Breached", 15),
          column("planned_end_time", "Breach time", 25),
          column("business_percentage", "Elapsed %", 16, "right"),
        ],
        emptyText: "No SLAs attached.",
      }),
      related({
        title: "Affected CIs ({{list.count}})",
        table: "task_ci",
        field: "task",
        limit: 50,
        columns: [column("ci_item", "Configuration item", 60), column("ci_item.sys_class_name", "Class", 40)],
        emptyText: "No affected CIs recorded.",
      }),
      related({
        title: "Child incidents ({{list.count}})",
        table: "incident",
        field: "parent_incident",
        orderBy: "number",
        limit: 50,
        columns: [
          column("number", "Number", 16),
          column("short_description", "Short description", 44),
          column("priority", "Priority", 18),
          column("state", "State", 22),
        ],
        emptyText: "No child incidents.",
      }),
    ],
    footer: printedFooter,
  },
};

const majorIncidentReview: GalleryTemplate = {
  key: "major-incident-review",
  name: "Major incident review",
  kind: "deck",
  table: "incident",
  description:
    "A slide per open priority 1 or 2 incident: state, impact, ownership and the tasks still open. For a daily stand-up or a bridge call.",
  query: "active=true^priorityIN1,2",
  orderBy: "priority",
  limit: 20,
  body: {
    page: slide("dark", "#fb7185"),
    style: slideStyle("dark"),
    cover: titleSlide(
      "PRIORITY 1 & 2 INCIDENTS",
      "#fb7185",
      "{{deck.count}} incidents · {{now.date}}",
      "#f8fafc",
      "#94a3b8",
    ),
    blocks: [
      {
        type: "text",
        text: "{{record.number}} · {{record.priority}}",
        size: 14,
        bold: true,
        color: "#fb7185",
        spaceAfter: 2,
      },
      { type: "heading", text: "{{record.short_description}}", size: 28, color: "#f8fafc", spaceAfter: 16 },
      {
        type: "stats",
        items: [field("State", "state"), field("Impact", "impact"), field("Assignment group", "assignment_group")],
      },
      {
        type: "columns",
        gap: 24,
        columns: [
          { heading: "Service", text: "{{record.business_service}}\n{{record.cmdb_ci}}" },
          { heading: "People", text: "Caller: {{record.caller_id}}\nAssigned: {{record.assigned_to}}" },
          { heading: "Timeline", text: "Opened {{record.opened_at}}\nUpdated {{record.sys_updated_on}}" },
        ],
      },
      { type: "spacer", height: 6 },
      related({
        title: "Open tasks ({{list.count}})",
        table: "incident_task",
        field: "incident",
        query: "active=true",
        orderBy: "number",
        limit: 4,
        fontSize: 12,
        columns: [
          column("number", "Number", 20),
          column("short_description", "Short description", 52),
          column("assigned_to", "Assigned to", 28),
        ],
        emptyText: "No open tasks.",
      }),
    ],
    footer: { text: "{{deck.title}} · {{now.date}}", showPageNumbers: false },
  },
};

/* ---------------------------- change request ----------------------------- */

const CHANGE_BLUE = "#1d4ed8";

const changeRequest: GalleryTemplate = {
  key: "change-request",
  name: "Change request",
  kind: "document",
  table: "change_request",
  description:
    "A change as a CAB packet: risk and impact, the planned window, the plans, its tasks, approvals, affected CIs and impacted services, with sign-off lines.",
  query: "active=true",
  orderBy: "start_date",
  limit: 50,
  body: {
    page: paper(CHANGE_BLUE),
    style: paperStyle("#eff6ff"),
    blocks: [
      ...masthead(
        "CHANGE REQUEST",
        CHANGE_BLUE,
        "{{record.short_description}}",
        "{{record.number}} · {{record.type}} change · Requested by {{record.requested_by}}",
      ),
      {
        type: "stats",
        items: [
          field("Risk", "risk"),
          field("Impact", "impact"),
          field("State", "state"),
          field("Approval", "approval"),
        ],
      },
      {
        type: "columns",
        columns: [
          { heading: "Planned window", text: "{{record.start_date}}\nto {{record.end_date}}" },
          { heading: "Ownership", text: "{{record.assignment_group}}\n{{record.assigned_to}}" },
          { heading: "Affects", text: "{{record.business_service}}\n{{record.cmdb_ci}}" },
        ],
      },
      { type: "divider" },
      {
        type: "fields",
        rows: [
          field("Category", "category"),
          field("Priority", "priority"),
          field("Conflict status", "conflict_status"),
          field("Opened", "opened_at"),
          field("Opened by", "opened_by"),
        ],
      },
      { type: "spacer", height: 6 },
      section("Description"),
      { type: "text", text: "{{record.description}}", spaceAfter: 12 },
      section("Plans"),
      {
        type: "fields",
        rows: [
          field("Justification", "justification"),
          field("Implementation plan", "implementation_plan"),
          field("Risk and impact analysis", "risk_impact_analysis"),
          field("Backout plan", "backout_plan"),
          field("Test plan", "test_plan"),
        ],
      },
      { type: "spacer", height: 8 },
      related({
        title: "Change tasks ({{list.count}})",
        table: "change_task",
        field: "change_request",
        orderBy: "planned_start_date",
        limit: 50,
        columns: [
          column("number", "Number", 17),
          column("short_description", "Short description", 31),
          column("state", "State", 11),
          column("assigned_to", "Assigned to", 19),
          column("planned_start_date", "Planned start", 22),
        ],
        emptyText: "No change tasks.",
      }),
      related({
        title: "Approvals ({{list.count}})",
        table: "sysapproval_approver",
        field: "sysapproval",
        orderBy: "sys_created_on",
        limit: 50,
        columns: [
          column("approver", "Approver", 40),
          column("state", "State", 25),
          column("sys_updated_on", "Updated", 35),
        ],
        emptyText: "No approvals requested yet.",
      }),
      related({
        title: "Affected CIs ({{list.count}})",
        table: "task_ci",
        field: "task",
        limit: 50,
        columns: [column("ci_item", "Configuration item", 60), column("ci_item.sys_class_name", "Class", 40)],
        emptyText: "No affected CIs recorded.",
      }),
      related({
        title: "Impacted services ({{list.count}})",
        table: "task_cmdb_ci_service",
        field: "task",
        limit: 50,
        columns: [column("cmdb_ci_service", "Service", 100)],
        emptyText: "No impacted services recorded.",
      }),
      {
        type: "signatures",
        parties: [
          { label: "Change manager", caption: "Name and date" },
          { label: "Implementer", caption: "Name and date" },
          { label: "CAB chair", caption: "Name and date" },
        ],
      },
    ],
    footer: printedFooter,
  },
};

const cabReview: GalleryTemplate = {
  key: "cab-review",
  name: "CAB review",
  kind: "deck",
  table: "change_request",
  description:
    "A slide per change awaiting approval, in schedule order: risk, window, owner, what it touches and where its approvals stand. For the CAB meeting.",
  query: "active=true^approval=requested",
  orderBy: "start_date",
  limit: 25,
  body: {
    page: slide("light", "#2563eb"),
    style: slideStyle("light"),
    cover: titleSlide(
      "CHANGE ADVISORY BOARD",
      "#2563eb",
      "{{deck.count}} changes awaiting approval · {{now.date}}",
      "#0f172a",
      "#64748b",
    ),
    blocks: [
      {
        type: "text",
        text: "{{record.number}} · {{record.type}} change",
        size: 14,
        bold: true,
        color: "#2563eb",
        spaceAfter: 2,
      },
      { type: "heading", text: "{{record.short_description}}", size: 28, color: "#0f172a", spaceAfter: 16 },
      {
        type: "stats",
        items: [field("Risk", "risk"), field("Impact", "impact"), field("State", "state")],
      },
      {
        type: "columns",
        gap: 24,
        columns: [
          { heading: "Window", text: "{{record.start_date}}\nto {{record.end_date}}" },
          { heading: "Owner", text: "{{record.assignment_group}}\n{{record.assigned_to}}" },
          { heading: "Affects", text: "{{record.business_service}}\n{{record.cmdb_ci}}" },
        ],
      },
      { type: "spacer", height: 6 },
      related({
        title: "Approvals ({{list.count}})",
        table: "sysapproval_approver",
        field: "sysapproval",
        orderBy: "sys_created_on",
        limit: 4,
        fontSize: 12,
        columns: [
          column("approver", "Approver", 46),
          column("state", "State", 24),
          column("sys_updated_on", "Updated", 30),
        ],
        emptyText: "No approvals requested yet.",
      }),
    ],
    footer: { text: "{{deck.title}} · {{now.date}}", showPageNumbers: false },
  },
};

/* -------------------------------- problem -------------------------------- */

const PROBLEM_AMBER = "#b45309";

const problemReport: GalleryTemplate = {
  key: "problem-report",
  name: "Problem report",
  kind: "document",
  table: "problem",
  description:
    "A problem and what is known about it: the workaround, cause and fix, with its problem tasks and any problems closed as duplicates of it.",
  query: "active=true",
  orderBy: "-opened_at",
  limit: 50,
  body: {
    page: paper(PROBLEM_AMBER),
    style: paperStyle("#fffbeb"),
    blocks: [
      ...masthead(
        "PROBLEM REPORT",
        PROBLEM_AMBER,
        "{{record.short_description}}",
        "{{record.number}} · Opened {{record.opened_at}} by {{record.opened_by}}",
      ),
      {
        type: "stats",
        items: [field("State", "state"), field("Priority", "priority"), field("Category", "category")],
      },
      {
        type: "columns",
        columns: [
          { heading: "Service", text: "{{record.business_service}}\n{{record.cmdb_ci}}" },
          { heading: "Assignment", text: "{{record.assignment_group}}\n{{record.assigned_to}}" },
          { heading: "First reported by", text: "{{record.first_reported_by_task}}" },
        ],
      },
      { type: "divider" },
      section("Description"),
      { type: "text", text: "{{record.description}}", spaceAfter: 12 },
      section("Root cause and fix"),
      {
        type: "fields",
        rows: [
          field("Known error", "known_error"),
          field("Workaround", "workaround"),
          field("Cause", "cause_notes"),
          field("Fix", "fix_notes"),
          field("Resolution code", "resolution_code"),
        ],
      },
      { type: "spacer", height: 8 },
      related({
        title: "Problem tasks ({{list.count}})",
        table: "problem_task",
        field: "problem",
        orderBy: "number",
        limit: 50,
        columns: [
          column("number", "Number", 17),
          column("short_description", "Short description", 39),
          column("problem_task_type", "Type", 14),
          column("state", "State", 12),
          column("assigned_to", "Assigned to", 18),
        ],
        emptyText: "No problem tasks.",
      }),
      related({
        title: "Duplicates ({{list.count}})",
        table: "problem",
        field: "duplicate_of",
        orderBy: "number",
        limit: 50,
        columns: [
          column("number", "Number", 16),
          column("short_description", "Short description", 50),
          column("state", "State", 16),
          column("opened_at", "Opened", 18),
        ],
        emptyText: "No problems were closed as duplicates of this one.",
      }),
    ],
    footer: printedFooter,
  },
};

/* ----------------------------- requested item ---------------------------- */

const REQUEST_GREEN = "#047857";

const requestedItem: GalleryTemplate = {
  key: "requested-item",
  name: "Requested item",
  kind: "document",
  table: "sc_req_item",
  description:
    "A catalog request item as a fulfilment sheet: who it is for, where it stands, its catalog tasks and approvals.",
  query: "active=true",
  orderBy: "-opened_at",
  limit: 50,
  body: {
    page: paper(REQUEST_GREEN),
    style: paperStyle("#ecfdf5"),
    blocks: [
      ...masthead(
        "REQUESTED ITEM",
        REQUEST_GREEN,
        "{{record.cat_item}}",
        "{{record.number}} · Request {{record.request}} · Opened {{record.opened_at}} by {{record.opened_by}}",
      ),
      {
        type: "stats",
        items: [
          field("Stage", "stage"),
          field("State", "state"),
          field("Approval", "approval"),
          field("Quantity", "quantity"),
        ],
      },
      {
        type: "columns",
        columns: [
          {
            heading: "Requested for",
            text: "{{record.request.requested_for}}\n{{record.request.requested_for.email}}",
          },
          { heading: "Fulfilment", text: "{{record.assignment_group}}\n{{record.assigned_to}}" },
          { heading: "Due", text: "{{record.due_date}}" },
        ],
      },
      { type: "divider" },
      {
        type: "fields",
        rows: [
          field("Short description", "short_description"),
          field("Price", "price"),
          field("Last updated", "sys_updated_on"),
        ],
      },
      { type: "spacer", height: 8 },
      related({
        title: "Catalog tasks ({{list.count}})",
        table: "sc_task",
        field: "request_item",
        orderBy: "number",
        limit: 50,
        columns: [
          column("number", "Number", 18),
          column("short_description", "Short description", 34),
          column("state", "State", 15),
          column("assignment_group", "Group", 17),
          column("assigned_to", "Assigned to", 16),
        ],
        emptyText: "No catalog tasks yet.",
      }),
      related({
        title: "Approvals ({{list.count}})",
        table: "sysapproval_approver",
        field: "sysapproval",
        orderBy: "sys_created_on",
        limit: 50,
        columns: [
          column("approver", "Approver", 40),
          column("state", "State", 25),
          column("sys_updated_on", "Updated", 35),
        ],
        emptyText: "No approvals.",
      }),
    ],
    footer: printedFooter,
  },
};

/* --------------------------------- the set ------------------------------- */

export const GALLERY: GalleryTemplate[] = [
  incidentReport,
  majorIncidentReview,
  changeRequest,
  cabReview,
  problemReport,
  requestedItem,
];

/** The gallery entries a new template of this kind could start from. */
export const galleryFor = (kind: TemplateKind): GalleryTemplate[] => GALLERY.filter(entry => entry.kind === kind);
