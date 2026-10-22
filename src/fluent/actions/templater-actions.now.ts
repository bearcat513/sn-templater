import '@servicenow/sdk/global'
import { Action, actionStep, wfa } from '@servicenow/sdk/automation'
import { BooleanColumn, IntegerColumn, ReferenceColumn, StringColumn } from '@servicenow/sdk/core'

/*
 * Templater in Flow Designer: each action is one script step over the
 * Templater script include (src/fluent/script-includes/templater.server.js),
 * so a flow gets the same links and presentations a script would, without a
 * script step of its own. PDFs are still drawn in the browser: these hand a
 * flow a link that makes one, not the file.
 */

const TEMPLATE_TABLE = 'x_1040823_template_template'
const PRESENTATION_TABLE = 'x_1040823_template_presentation'

export const getExportLink = Action(
    {
        $id: Now.ID['action-export-link'],
        name: 'Get Templater export link',
        description:
            'A link that opens Templater and makes a PDF of one record, or of the records a query matches, with a template.',
        category: 'Templater',
        inputs: {
            template: ReferenceColumn({ label: 'Template', referenceTable: TEMPLATE_TABLE, mandatory: true }),
            record: StringColumn({ label: 'Record sys_id', hint: 'One record. Leave empty to use the query.' }),
            query: StringColumn({
                label: 'Records query',
                maxLength: 4000,
                hint: 'An encoded query on the template’s table.',
            }),
            absolute: BooleanColumn({
                label: 'Full address',
                default: true,
                hint: 'For an email: the instance’s address in front.',
            }),
        },
        outputs: {
            url: StringColumn({ label: 'Export link', maxLength: 4000 }),
        },
    },
    params => {
        const step = wfa.actionStep(
            actionStep.script,
            { $id: Now.ID['action-export-link-script'], label: 'Make the link' },
            {
                required_run_time: 'instance',
                script: Now.include('./scripts/export-link.js'),
                inputVariables: {
                    template: { label: 'Template', value: wfa.dataPill(params.inputs.template, 'reference') },
                    record: { label: 'Record', value: wfa.dataPill(params.inputs.record, 'string') },
                    query: { label: 'Query', value: wfa.dataPill(params.inputs.query, 'string') },
                    absolute: { label: 'Absolute', value: wfa.dataPill(params.inputs.absolute, 'boolean') },
                },
                outputVariables: {
                    url: StringColumn({ label: 'Link', maxLength: 4000 }),
                },
            }
        )
        wfa.assignActionOutputs(params.outputs, { url: wfa.dataPill(step.url, 'string') })
    }
)

export const createPresentation = Action(
    {
        $id: Now.ID['action-create-presentation'],
        name: 'Create Templater presentation',
        description:
            'Saves a presentation: on a deck template and the records a query matches, or blank. Returns it and links to present and edit it.',
        category: 'Templater',
        inputs: {
            name: StringColumn({ label: 'Name', mandatory: true, maxLength: 100 }),
            template: ReferenceColumn({
                label: 'Deck template',
                referenceTable: TEMPLATE_TABLE,
                hint: 'Leave empty for a blank presentation.',
            }),
            title: StringColumn({ label: 'Deck title', maxLength: 200 }),
            query: StringColumn({ label: 'Records query', maxLength: 4000 }),
            limit: IntegerColumn({ label: 'Record limit', default: 20 }),
        },
        outputs: {
            presentation: ReferenceColumn({ label: 'Presentation', referenceTable: PRESENTATION_TABLE }),
            present_url: StringColumn({ label: 'Present link', maxLength: 4000 }),
            build_url: StringColumn({ label: 'Edit link', maxLength: 4000 }),
        },
    },
    params => {
        const step = wfa.actionStep(
            actionStep.script,
            { $id: Now.ID['action-create-presentation-script'], label: 'Save the presentation' },
            {
                required_run_time: 'instance',
                script: Now.include('./scripts/create-presentation.js'),
                inputVariables: {
                    name: { label: 'Name', value: wfa.dataPill(params.inputs.name, 'string') },
                    template: { label: 'Template', value: wfa.dataPill(params.inputs.template, 'reference') },
                    title: { label: 'Title', value: wfa.dataPill(params.inputs.title, 'string') },
                    query: { label: 'Query', value: wfa.dataPill(params.inputs.query, 'string') },
                    limit: { label: 'Limit', value: wfa.dataPill(params.inputs.limit, 'integer') },
                },
                outputVariables: {
                    presentation: StringColumn({ label: 'Presentation', maxLength: 32 }),
                    present_url: StringColumn({ label: 'Present link', maxLength: 4000 }),
                    build_url: StringColumn({ label: 'Edit link', maxLength: 4000 }),
                },
            }
        )
        wfa.assignActionOutputs(params.outputs, {
            presentation: wfa.dataPill(step.presentation, 'string'),
            present_url: wfa.dataPill(step.present_url, 'string'),
            build_url: wfa.dataPill(step.build_url, 'string'),
        })
    }
)

export const addSlide = Action(
    {
        $id: Now.ID['action-add-slide'],
        name: 'Add slide to Templater presentation',
        description: 'Adds a custom slide — a title, text and speaker notes — at the end of a saved presentation.',
        category: 'Templater',
        inputs: {
            presentation: ReferenceColumn({
                label: 'Presentation',
                referenceTable: PRESENTATION_TABLE,
                mandatory: true,
            }),
            layout: StringColumn({
                label: 'Layout',
                default: 'titleContent',
                choices: {
                    titleContent: { label: 'Title and content', sequence: 10 },
                    title: { label: 'Title slide', sequence: 20 },
                    section: { label: 'Section header', sequence: 30 },
                    titleOnly: { label: 'Title only', sequence: 40 },
                    blank: { label: 'Blank', sequence: 50 },
                },
            }),
            title: StringColumn({ label: 'Title', maxLength: 200 }),
            text: StringColumn({ label: 'Text', maxLength: 4000 }),
            notes: StringColumn({ label: 'Speaker notes', maxLength: 5000 }),
        },
        outputs: {
            present_url: StringColumn({ label: 'Present link', maxLength: 4000 }),
        },
    },
    params => {
        const step = wfa.actionStep(
            actionStep.script,
            { $id: Now.ID['action-add-slide-script'], label: 'Add the slide' },
            {
                required_run_time: 'instance',
                script: Now.include('./scripts/add-slide.js'),
                inputVariables: {
                    presentation: {
                        label: 'Presentation',
                        value: wfa.dataPill(params.inputs.presentation, 'reference'),
                    },
                    layout: { label: 'Layout', value: wfa.dataPill(params.inputs.layout, 'string') },
                    title: { label: 'Title', value: wfa.dataPill(params.inputs.title, 'string') },
                    text: { label: 'Text', value: wfa.dataPill(params.inputs.text, 'string') },
                    notes: { label: 'Notes', value: wfa.dataPill(params.inputs.notes, 'string') },
                },
                outputVariables: {
                    present_url: StringColumn({ label: 'Present link', maxLength: 4000 }),
                },
            }
        )
        wfa.assignActionOutputs(params.outputs, { present_url: wfa.dataPill(step.present_url, 'string') })
    }
)
