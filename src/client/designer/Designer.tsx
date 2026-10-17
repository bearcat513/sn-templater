import React, { useState } from 'react'
import type { PdfBlock, PdfTemplate, TemplateKind } from '../engine/template'
import type { TableSchema } from '../services/schema'
import { Button, Segmented, cx } from '../ui/controls'
import { Icon } from '../ui/icons'
import { BlockList } from './BlockList'
import { FooterSection, LetterheadSection, PageSection, StyleSection, WatermarkSection } from './DocumentSections'
import { Preview } from './Preview'
import { TokenPanel } from './TokenPanel'
import { TokenTargetProvider } from './TokenTarget'

type Props = {
    template: PdfTemplate
    onChange: (next: PdfTemplate) => void
    kind: TemplateKind
    schema: TableSchema
    title: string
    previewRecord: string
    onPreviewRecordChange: (sysId: string) => void
}

type Pane = 'content' | 'look'
type Part = 'record' | 'cover'
type Section = 'page' | 'style' | 'letterhead' | 'watermark' | 'footer'

/**
 * Designing a template: tokens on the left, the template in the middle, the
 * document on the right — redrawn as it changes, by the same renderer the
 * export uses.
 */
export function Designer({ template, onChange, kind, schema, title, previewRecord, onPreviewRecordChange }: Props) {
    const [pane, setPane] = useState<Pane>('content')
    const [part, setPart] = useState<Part>('record')
    const [section, setSection] = useState<Section | null>('page')
    const [tokensOpen, setTokensOpen] = useState(true)

    const toggle = (name: Section) => setSection(current => (current === name ? null : name))
    const hasCover = Boolean(template.cover?.length)
    const showingCover = part === 'cover' && hasCover

    const setBlocks = (blocks: PdfBlock[]) =>
        showingCover
            ? onChange({ ...template, cover: blocks.length ? blocks : undefined })
            : onChange({ ...template, blocks })

    const addCover = () => {
        onChange({
            ...template,
            cover: [
                { type: 'spacer', height: kind === 'deck' ? 120 : 200 },
                { type: 'heading', text: '{{deck.title}}', size: kind === 'deck' ? 44 : 28 },
                { type: 'text', text: '{{deck.count}} records from {{table.label}} · {{now.date}}', color: '#6b7280' },
            ],
        })
        setPart('cover')
    }

    return (
        <TokenTargetProvider>
            <div className={cx('tp-designer', !tokensOpen && 'is-tokens-closed')}>
                <aside className="tp-designer__tokens" aria-label="Tokens">
                    {tokensOpen ? (
                        <>
                            <div className="tp-designer__rail-header">
                                <h3>
                                    <Icon name="braces" /> Tokens
                                </h3>
                                <button type="button" className="tp-link-btn" onClick={() => setTokensOpen(false)}>
                                    Hide
                                </button>
                            </div>
                            <TokenPanel schema={schema} />
                        </>
                    ) : (
                        <button type="button" className="tp-designer__rail" onClick={() => setTokensOpen(true)} aria-label="Show tokens">
                            <Icon name="braces" />
                            <span>Tokens</span>
                        </button>
                    )}
                </aside>

                <div className="tp-designer__editor">
                    <Segmented<Pane>
                        label="Edit"
                        value={pane}
                        onChange={setPane}
                        options={[
                            { value: 'content', label: 'Content', icon: 'layers' },
                            { value: 'look', label: 'Page & style', icon: 'settings' },
                        ]}
                    />

                    {pane === 'content' ? (
                        <div className="tp-stack">
                            <div className="tp-row tp-row--between tp-row--wrap">
                                {hasCover ? (
                                    <Segmented<Part>
                                        label="Which part"
                                        size="sm"
                                        value={showingCover ? 'cover' : 'record'}
                                        onChange={setPart}
                                        options={[
                                            { value: 'record', label: kind === 'deck' ? 'Each record’s slide' : 'Each record' },
                                            { value: 'cover', label: kind === 'deck' ? 'Title slide' : 'Cover page' },
                                        ]}
                                    />
                                ) : (
                                    <p className="tp-subtle">
                                        {kind === 'deck'
                                            ? 'These blocks make one slide per record. A page break starts another.'
                                            : 'These blocks are drawn for each record; a long one flows onto more pages.'}
                                    </p>
                                )}
                                {!hasCover ? (
                                    <Button size="sm" variant="ghost" icon="plus" onClick={addCover}>
                                        {kind === 'deck' ? 'Title slide' : 'Cover page'}
                                    </Button>
                                ) : showingCover ? (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        icon="trash"
                                        onClick={() => {
                                            onChange({ ...template, cover: undefined })
                                            setPart('record')
                                        }}
                                    >
                                        Remove {kind === 'deck' ? 'title slide' : 'cover'}
                                    </Button>
                                ) : null}
                            </div>
                            {showingCover && (
                                <p className="tp-subtle">
                                    Drawn once, before the first record. Record tokens are blank here — use{' '}
                                    <code>deck.*</code>, <code>table.*</code>, <code>now.*</code> and <code>user.*</code>.
                                </p>
                            )}
                            <BlockList
                                key={showingCover ? 'cover' : 'record'}
                                blocks={showingCover ? template.cover! : template.blocks}
                                onChange={setBlocks}
                                kind={kind}
                                schema={schema}
                                label={showingCover ? 'Cover blocks' : 'Record blocks'}
                            />
                        </div>
                    ) : (
                        <div className="tp-stack tp-stack--tight">
                            <PageSection template={template} onChange={onChange} open={section === 'page'} onToggle={() => toggle('page')} />
                            <StyleSection template={template} onChange={onChange} open={section === 'style'} onToggle={() => toggle('style')} />
                            <LetterheadSection
                                template={template}
                                onChange={onChange}
                                open={section === 'letterhead'}
                                onToggle={() => toggle('letterhead')}
                            />
                            <WatermarkSection
                                template={template}
                                onChange={onChange}
                                open={section === 'watermark'}
                                onToggle={() => toggle('watermark')}
                            />
                            <FooterSection template={template} onChange={onChange} open={section === 'footer'} onToggle={() => toggle('footer')} />
                        </div>
                    )}
                </div>

                <div className="tp-designer__preview">
                    <Preview
                        template={template}
                        kind={kind}
                        schema={schema}
                        title={title}
                        recordId={previewRecord}
                        onRecordChange={onPreviewRecordChange}
                    />
                </div>
            </div>
        </TokenTargetProvider>
    )
}
