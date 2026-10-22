import React, { useState } from 'react'
import { MAX_SECTION_RECORDS, type DeckSection } from '../engine/presentation'
import { useAsync } from '../hooks/useAsync'
import { SchemaService } from '../services/schema'
import { TemplateService, type TemplateRecord } from '../services/templates'
import { Button, Field, Input, Notice, Spinner, Switch } from '../ui/controls'
import { Modal } from '../ui/overlays'
import { SelectionForm, TemplateChooser, type Selection } from '../views/common'
import type { Meta } from './meta'

/** Which deck the presentation is built on, which records get slides, and what it is called. */
export function SettingsModal({
    meta,
    onClose,
    onApply,
}: {
    meta: Meta
    onClose: () => void
    onApply: (meta: Meta) => void
}) {
    const templates = useAsync(() => TemplateService.list(), [])
    const [draft, setDraft] = useState<Meta>(meta)
    const chosen = templates.data?.find(template => template.sysId === draft.templateId)
    const schema = useAsync(() => SchemaService.table(chosen!.table), [chosen?.table], Boolean(chosen))
    const selection: Selection = {
        mode: 'many',
        sysId: '',
        query: draft.query,
        orderBy: draft.orderBy,
        limit: draft.limit,
    }
    const decks = (templates.data ?? []).filter(
        template => (template.kind === 'deck' && template.active) || template.sysId === draft.templateId
    )
    const blank = !draft.templateId

    return (
        <Modal
            open
            size="lg"
            title="Deck and records"
            onClose={onClose}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={() => onApply(draft)}>
                        Apply
                    </Button>
                </>
            }
        >
            <div className="tp-stack">
                <div className="tp-grid tp-grid--2">
                    <Field label="Presentation name">
                        <Input
                            value={draft.name}
                            maxLength={100}
                            onChange={event => setDraft({ ...draft, name: event.target.value })}
                        />
                    </Field>
                    <Field label="Deck title" hint="Shown on the title slide as {{deck.title}}.">
                        <Input
                            value={draft.title}
                            maxLength={200}
                            onChange={event => setDraft({ ...draft, title: event.target.value })}
                        />
                    </Field>
                </div>
                <Switch
                    checked={blank}
                    onChange={on =>
                        setDraft(
                            on
                                ? { ...draft, templateId: '', query: '', orderBy: '' }
                                : { ...draft, templateId: decks[0]?.sysId ?? '' }
                        )
                    }
                    label="Build it from nothing — no deck template, just your own slides and the templates you place in it"
                />
                {!blank && (
                    <Field
                        label="Deck template"
                        hint="Its slides are drawn for each record. Custom slides stay whichever deck you choose."
                    >
                        {templates.loading ? (
                            <p className="tp-row tp-subtle">
                                <Spinner size={14} /> Loading templates…
                            </p>
                        ) : (
                            <TemplateChooser
                                templates={decks}
                                value={draft.templateId}
                                onChange={template =>
                                    setDraft({
                                        ...draft,
                                        templateId: template.sysId,
                                        // Another table's filter means nothing here: start from the deck's own.
                                        ...(template.table !== chosen?.table
                                            ? {
                                                  query: template.query,
                                                  orderBy: template.orderBy,
                                                  limit: template.limit,
                                              }
                                            : {}),
                                    })
                                }
                                empty="No slide decks yet. Create one on the Templates page."
                            />
                        )}
                    </Field>
                )}
                {blank ? null : schema.data ? (
                    <SelectionForm
                        schema={schema.data}
                        allowOne={false}
                        selection={selection}
                        onChange={next =>
                            setDraft({ ...draft, query: next.query, orderBy: next.orderBy, limit: next.limit })
                        }
                    />
                ) : schema.loading ? (
                    <p className="tp-row tp-subtle">
                        <Spinner size={14} /> Reading the table…
                    </p>
                ) : null}
                <Notice kind="critical" lines={[templates.error, schema.error].filter(Boolean)} />
            </div>
        </Modal>
    )
}

/** What the section dialog decides: everything about a section but its id. */
export type SectionDraft = Omit<DeckSection, 'id'>

/**
 * Places a template in the deck, or changes a placed one: which template,
 * which of its table's records get slides, and its title slide's title.
 */
export function SectionModal({
    section,
    onClose,
    onApply,
}: {
    section?: DeckSection
    onClose: () => void
    onApply: (draft: SectionDraft) => void
}) {
    const templates = useAsync(() => TemplateService.list(), [])
    const [draft, setDraft] = useState<SectionDraft>(() => section ?? { template: '', query: '', limit: 20 })
    const [showAll, setShowAll] = useState(false)
    const chosen = templates.data?.find(template => template.sysId === draft.template)
    const schema = useAsync(() => SchemaService.table(chosen!.table), [chosen?.table], Boolean(chosen))
    const selection: Selection = {
        mode: 'many',
        sysId: '',
        query: draft.query,
        orderBy: draft.orderBy ?? '',
        limit: draft.limit,
    }
    const list = (templates.data ?? []).filter(
        template =>
            template.sysId === draft.template ||
            (template.active && (template.kind === 'deck' || (showAll && template.kind === 'document')))
    )

    const pick = (template: TemplateRecord) =>
        setDraft(current => ({
            ...current,
            template: template.sysId,
            name: template.name,
            // Another table's filter means nothing here: start from the template's own.
            ...(template.table !== chosen?.table
                ? {
                      query: template.query,
                      orderBy: template.orderBy || undefined,
                      limit: Math.min(template.limit || 20, MAX_SECTION_RECORDS),
                  }
                : {}),
        }))

    return (
        <Modal
            open
            size="lg"
            title={section ? 'Change this section' : 'Place a template’s slides'}
            onClose={onClose}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="primary" disabled={!draft.template} onClick={() => onApply(draft)}>
                        {section ? 'Apply' : 'Place it'}
                    </Button>
                </>
            }
        >
            <div className="tp-stack">
                <p className="tp-muted">
                    The template draws its slides here — its title slide, then one for each record — in its own look,
                    and draws them again from the records each time the presentation opens.
                </p>
                <Field label="Template">
                    {templates.loading ? (
                        <p className="tp-row tp-subtle">
                            <Spinner size={14} /> Loading templates…
                        </p>
                    ) : (
                        <TemplateChooser
                            templates={list}
                            value={draft.template}
                            onChange={pick}
                            empty="No slide decks yet. Create one on the Templates page, or show PDF templates too."
                        />
                    )}
                </Field>
                <Switch
                    checked={showAll}
                    onChange={setShowAll}
                    label="Show PDF templates too — any template can be drawn as slides"
                />
                {chosen && (
                    <Field
                        label="Section title"
                        hint="Shown on its title slide as {{deck.title}}. Empty is the template’s name."
                    >
                        <Input
                            value={draft.title ?? ''}
                            maxLength={200}
                            placeholder={chosen.name}
                            onChange={event => setDraft({ ...draft, title: event.target.value || undefined })}
                        />
                    </Field>
                )}
                {schema.data ? (
                    <SelectionForm
                        schema={schema.data}
                        allowOne={false}
                        selection={selection}
                        onChange={next =>
                            setDraft({
                                ...draft,
                                query: next.query,
                                orderBy: next.orderBy || undefined,
                                limit: Math.max(1, Math.min(next.limit, MAX_SECTION_RECORDS)),
                            })
                        }
                    />
                ) : schema.loading ? (
                    <p className="tp-row tp-subtle">
                        <Spinner size={14} /> Reading the table…
                    </p>
                ) : null}
                {chosen && <p className="tp-subtle">A section shows at most {MAX_SECTION_RECORDS} records.</p>}
                <Notice kind="critical" lines={[templates.error, schema.error].filter(Boolean)} />
            </div>
        </Modal>
    )
}
