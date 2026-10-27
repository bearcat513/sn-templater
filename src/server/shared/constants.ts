/**
 * Names and limits that the browser, the instance's scripts and the Fluent
 * records all have to agree on, in one place.
 *
 * This module is pure — no Glide, no DOM — so the client bundles it, the
 * server modules import it, and the tests check the Fluent records against
 * it (src/client/engine/__tests__/constants.test.ts). Fluent `.now.ts` files
 * write the same names out as literals, because the Fluent compiler reads
 * them statically; that test is what keeps the two in step.
 */

export const SCOPE = 'x_1040823_template'

/* ------------------------------------------------------------------ tables */

export const TEMPLATE_TABLE = 'x_1040823_template_template'
export const VERSION_TABLE = 'x_1040823_template_version'
export const PRESENTATION_TABLE = 'x_1040823_template_presentation'
/** A presentation's published history, as a template's is kept in VERSION_TABLE. */
export const PRESENTATION_VERSION_TABLE = 'x_1040823_template_pres_version'
/** One emailed PDF of a batch: who sent which template's export to whom. Holds the file. */
export const DELIVERY_TABLE = 'x_1040823_template_delivery'
/** One export, presentation or email, counted for the template's owners. */
export const USAGE_TABLE = 'x_1040823_template_usage'
/** A comment on one slide of a presentation. */
export const COMMENT_TABLE = 'x_1040823_template_comment'
/** Someone presenting with followers: which slide is on their screen. */
export const LIVE_TABLE = 'x_1040823_template_live'

/* ------------------------------------------------------------------- roles */

export const USER_ROLE = 'x_1040823_template.user'
export const EDITOR_ROLE = 'x_1040823_template.editor'

/* -------------------------------------------------------------- properties */

export const DEBUG_PROPERTY = 'x_1040823_template.debug'
/** Days a picture attachment named only by old versions is kept. */
export const PICTURE_RETENTION_PROPERTY = 'x_1040823_template.picture_retention_days'

/* ------------------------------------------------------------ entry points */

/** The UI page. */
export const PAGE = 'x_1040823_template_templater.do'
/** The scripted REST API's base path. */
export const API_BASE = '/api/x_1040823_template/templater'

/* ---------------------------------------------------------------- pictures */

/** Every picture attachment Templater writes is named `templater-<hash>.<ext>`. */
export const PICTURE_PREFIX = 'templater-'
/** How a body names one: `attachment:templater-<hash>.png`. */
export const PICTURE_SCHEME = 'attachment:'

/* ------------------------------------------------------------------ limits */

/** Records one render covers. Loaded in pages of LOAD_PAGE_SIZE. */
export const MAX_RECORDS = 2000
/** Records read in one Table API request. */
export const LOAD_PAGE_SIZE = 100
/** Rows of one related list or repeat. */
export const MAX_RELATED_ROWS = 500
/** Characters in a template or presentation body. Pictures are attachments and do not count. */
export const MAX_BODY_LENGTH = 3_000_000
export const MAX_NAME_LENGTH = 100
export const MAX_BLOCKS = 200
export const MAX_REPEAT_BLOCKS = 40
export const MAX_CUSTOM_SLIDES = 200
export const MAX_ELEMENTS = 120
export const MAX_NOTES_LENGTH = 5000
export const MAX_SECTIONS = 20
export const MAX_SECTION_RECORDS = 200
/** Recipients of one email. */
export const MAX_RECIPIENTS = 20
