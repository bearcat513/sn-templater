import { gs, GlideDate, GlideDateTime, GlideRecord, GlideRecordSecure, GlideTableHierarchy } from '@servicenow/glide'

/**
 * The scripted REST API behind the Templater UI page.
 *
 * Everything else the page needs — templates, records, related lists — goes
 * through the Table API with the viewer's own session, so record access is
 * always the platform's ACLs. This API only answers the two questions the
 * Table API answers badly:
 *
 * - **What fields does a table have?** Including every inherited one: an
 *   incident's fields live on `incident` *and* `task`, which `sys_dictionary`
 *   only tells you a table at a time.
 * - **Which tables point at it?** The candidates for a related list.
 */

const USER_ROLE = 'x_1040823_template.user'
const DEBUG_PROPERTY = 'x_1040823_template.debug'
const TABLE_NAME = /^[a-z0-9_]{1,80}$/
const MAX_RELATIONSHIPS = 400

type Request = { pathParams: Record<string, string>; queryParams: Record<string, string[]> }
type Response = {
    setStatus(code: number): void
    setBody(body: unknown): void
    setHeader(name: string, value: string): void
}

/** Whether the Templater developer tools are on (the x_1040823_template.debug property). */
const debugOn = (): boolean => String(gs.getProperty(DEBUG_PROPERTY, 'false')) === 'true'

/**
 * Runs a route and, with debugging on, reports how long it took: in the
 * system log, and in a Server-Timing header the page's network log shows.
 */
function timed(route: string, response: Response, work: () => void) {
    if (!debugOn()) {
        work()
        return
    }
    const started = new Date().getTime()
    try {
        work()
    } finally {
        const ms = new Date().getTime() - started
        // The route carries a path parameter: keep only what a header value can safely hold.
        const label = route.replace(/[^A-Za-z0-9_/ .-]/g, '').slice(0, 120)
        response.setHeader('Server-Timing', 'templater;desc="' + label + '";dur=' + ms)
        gs.info('[Templater] ' + label + ' took ' + ms + 'ms for ' + gs.getUserName())
    }
}

function refuse(response: Response, status: number, message: string) {
    response.setStatus(status)
    response.setBody({ error: { message } })
}

function allowed(response: Response): boolean {
    if (gs.hasRole(USER_ROLE)) return true
    refuse(response, 403, 'Templater needs the ' + USER_ROLE + ' role.')
    return false
}

/** A table the viewer can read, or null after answering why not. */
function readableTable(name: string, response: Response): string | null {
    if (!TABLE_NAME.test(name) || !gs.tableExists(name)) {
        refuse(response, 404, 'There is no table called "' + name + '".')
        return null
    }
    if (!new GlideRecordSecure(name).canRead()) {
        refuse(response, 403, 'You cannot read the ' + name + ' table.')
        return null
    }
    return name
}

/** GET /schema/{table} — fields, inherited ones included, and the tables that reference it. */
export function getSchema(request: Request, response: Response) {
    timed('GET /schema/' + String(request.pathParams.table || ''), response, () => schemaRoute(request, response))
}

function schemaRoute(request: Request, response: Response) {
    if (!allowed(response)) return
    const table = readableTable(String(request.pathParams.table || ''), response)
    if (!table) return

    const record = new GlideRecord(table)
    record.initialize()

    const fields: { name: string; label: string; type: string; reference?: string }[] = []
    const elements = record.getElements()
    for (let i = 0; i < elements.length; i++) {
        const element = elements[i]!
        const descriptor = element.getED()
        const type = String(descriptor.getInternalType())
        const field: { name: string; label: string; type: string; reference?: string } = {
            name: String(element.getName()),
            label: String(element.getLabel()),
            type,
        }
        if (type === 'reference') {
            const reference = String(element.getReferenceTable() || '')
            if (reference) field.reference = reference
        }
        fields.push(field)
    }
    fields.sort((a, b) => (a.label.toLowerCase() < b.label.toLowerCase() ? -1 : 1))

    response.setBody({
        name: table,
        label: String(record.getClassDisplayValue() || table),
        displayField: String(record.getDisplayName() || ''),
        // The table and every table it extends: a template made for `task`
        // fits an incident, and the export view offers it there.
        ancestors: new GlideTableHierarchy(table).getTables().map(String),
        fields,
        relationships: relationshipsOf(table),
    })
}

/**
 * GET /tables?q= — tables whose name or label matches, that the caller can read.
 *
 * Here rather than a Table API call on sys_db_object, which most people who
 * use Templater cannot read.
 */
export function getTables(request: Request, response: Response) {
    timed('GET /tables', response, () => tablesRoute(request, response))
}

function tablesRoute(request: Request, response: Response) {
    if (!allowed(response)) return
    const term = String((request.queryParams.q && request.queryParams.q[0]) || '').trim()

    const tables = new GlideRecord('sys_db_object')
    if (term) {
        tables.addQuery('name', 'CONTAINS', term).addOrCondition('label', 'CONTAINS', term)
    }
    tables.addQuery('name', 'NOT LIKE', 'v_%')
    tables.addQuery('name', 'NOT LIKE', 'ts_%')
    tables.orderBy('label')
    tables.setLimit(80)
    tables.query()

    const found: { name: string; label: string }[] = []
    while (tables.next() && found.length < 40) {
        const name = String(tables.getValue('name'))
        if (!name || !gs.tableExists(name) || !new GlideRecordSecure(name).canRead()) continue
        found.push({ name, label: String(tables.getValue('label') || name) })
    }
    response.setBody({ tables: found })
}

/**
 * Reference fields on other tables that can point at this one — directly, or
 * at one of its ancestors (`task_sla.task` points at every incident).
 */
function relationshipsOf(table: string) {
    const targets = new GlideTableHierarchy(table).getTables()
    const labels: Record<string, string> = {}
    const readable: Record<string, boolean> = {}
    const found: { table: string; tableLabel: string; field: string; fieldLabel: string }[] = []

    const dictionary = new GlideRecord('sys_dictionary')
    dictionary.addQuery('internal_type', 'reference')
    dictionary.addQuery('reference', 'IN', targets.join(','))
    dictionary.addActiveQuery()
    dictionary.orderBy('name')
    dictionary.setLimit(MAX_RELATIONSHIPS)
    dictionary.query()

    while (dictionary.next()) {
        const name = String(dictionary.getValue('name'))
        const element = String(dictionary.getValue('element'))
        if (!name || !element || name.indexOf('sys_') === 0 || name.indexOf('var__') === 0) continue

        if (readable[name] === undefined) {
            readable[name] = gs.tableExists(name) && new GlideRecordSecure(name).canRead()
            if (readable[name]) labels[name] = String(new GlideRecord(name).getClassDisplayValue() || name)
        }
        if (!readable[name]) continue

        found.push({
            table: name,
            tableLabel: labels[name]!,
            field: element,
            fieldLabel: String(dictionary.getValue('column_label') || element),
        })
    }

    return found
}

/** GET /me — who is rendering, today's date in their own format, and whether debugging is on. */
export function getContext(_request: Request, response: Response) {
    if (!allowed(response)) return
    const user = gs.getUser()
    response.setBody({
        userId: String(gs.getUserID()),
        userName: String(gs.getUserName()),
        displayName: String(gs.getUserDisplayName()),
        email: String(user.getEmail() || ''),
        date: String(new GlideDate().getDisplayValue()),
        dateTime: String(new GlideDateTime().getDisplayValue()),
        canEdit: gs.hasRole('x_1040823_template.editor'),
        debug: debugOn(),
    })
}
