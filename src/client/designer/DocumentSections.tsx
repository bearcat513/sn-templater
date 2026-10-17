import React from 'react'
import { PAGE_SIZE_LABELS, PAGE_SIZES, isSlideSize, type PageSize } from '../engine/pdf'
import { FONT_FAMILIES, type FontFamily } from '../engine/pdfFonts'
import {
    defaultStyle,
    type PdfHeader,
    type PdfStyle,
    type PdfTableStyle,
    type PdfTemplate,
    type PdfWatermark,
} from '../engine/template'
import { Collapsible, ColorField, Field, NumberInput, Select, Switch } from '../ui/controls'
import { ImagePicker } from './ImagePicker'
import { TokenField } from './TokenTarget'

type SectionProps = {
    template: PdfTemplate
    onChange: (next: PdfTemplate) => void
    open: boolean
    onToggle: () => void
}

const FAMILY_LABELS: Record<FontFamily, string> = { helvetica: 'Helvetica', times: 'Times', courier: 'Courier' }
const familyOptions = FONT_FAMILIES.map(family => ({ value: family, label: FAMILY_LABELS[family] }))

/* ---------------------------------------------------------------- the page */

export function PageSection({ template, onChange, open, onToggle }: SectionProps) {
    const page = template.page
    const patch = (changes: Partial<PdfTemplate['page']>) => onChange({ ...template, page: { ...page, ...changes } })
    const slide = isSlideSize(page.size)

    return (
        <Collapsible
            title="Page"
            summary={`${PAGE_SIZE_LABELS[page.size]}${page.landscape && !slide ? ' landscape' : ''} · ${FAMILY_LABELS[page.family]} ${page.fontSize}pt`}
            open={open}
            onToggle={onToggle}
        >
            <div className="tp-grid tp-grid--3">
                <Field label="Paper">
                    <Select<PageSize>
                        value={page.size}
                        options={PAGE_SIZES.map(size => ({ value: size, label: PAGE_SIZE_LABELS[size] }))}
                        onChange={size => patch({ size })}
                        aria-label="Paper size"
                    />
                </Field>
                <Field label="Typeface">
                    <Select<FontFamily>
                        value={page.family}
                        options={familyOptions}
                        onChange={family => patch({ family })}
                        aria-label="Typeface"
                    />
                </Field>
                <Field label="Body size (pt)">
                    <NumberInput
                        min={6}
                        max={32}
                        step={0.5}
                        value={page.fontSize}
                        onChange={fontSize => patch({ fontSize: fontSize ?? 10 })}
                        aria-label="Body size"
                    />
                </Field>
            </div>

            {!slide && (
                <Switch
                    checked={page.landscape ?? false}
                    onChange={landscape => patch({ landscape: landscape || undefined })}
                    label="Landscape — wide related lists want it"
                />
            )}

            <div className="tp-grid tp-grid--4">
                <ColorField label="Text" value={page.textColor} onChange={textColor => patch({ textColor })} />
                <ColorField label="Muted" value={page.mutedColor} onChange={mutedColor => patch({ mutedColor })} />
                <ColorField label="Accent" value={page.accentColor} onChange={accentColor => patch({ accentColor })} />
                <ColorField
                    label="Background"
                    value={page.background ?? ''}
                    onChange={background => patch({ background: background || undefined })}
                    allowEmpty
                />
            </div>

            <div className="tp-grid tp-grid--4">
                {(['top', 'right', 'bottom', 'left'] as const).map(edge => (
                    <Field key={edge} label={`Margin ${edge}`}>
                        <NumberInput
                            min={12}
                            max={200}
                            value={page.margins[edge]}
                            onChange={value => patch({ margins: { ...page.margins, [edge]: value ?? 12 } })}
                            aria-label={`Margin ${edge} in points`}
                        />
                    </Field>
                ))}
            </div>
            <p className="tp-subtle">Sizes are in points — 72 to the inch.</p>
        </Collapsible>
    )
}

/* --------------------------------------------------------------- the style */

export function StyleSection({ template, onChange, open, onToggle }: SectionProps) {
    const fallback = defaultStyle(template.page.fontSize)
    const style: PdfStyle = { ...fallback, ...template.style }
    const table: PdfTableStyle = { ...fallback.table, ...template.style?.table }
    const patch = (changes: Partial<PdfStyle>) => onChange({ ...template, style: { ...style, ...changes } })
    const patchTable = (changes: Partial<PdfTableStyle>) => patch({ table: { ...table, ...changes } })

    return (
        <Collapsible
            title="Style"
            summary={`${style.lineHeight}× leading · headings ${style.headingScale}×${table.zebra ? ' · zebra' : ''}`}
            open={open}
            onToggle={onToggle}
        >
            <div className="tp-grid tp-grid--3">
                <Field label="Line height" hint="× the text size">
                    <NumberInput
                        min={1}
                        max={3}
                        step={0.05}
                        value={style.lineHeight}
                        onChange={lineHeight => patch({ lineHeight: lineHeight ?? 1.35 })}
                        aria-label="Line height"
                    />
                </Field>
                <Field label="Paragraph gap (pt)">
                    <NumberInput
                        min={0}
                        max={48}
                        value={style.paragraphSpacing}
                        onChange={paragraphSpacing => patch({ paragraphSpacing: paragraphSpacing ?? 4 })}
                        aria-label="Paragraph gap"
                    />
                </Field>
                <Field
                    label="Heading scale"
                    hint={`${Math.round(template.page.fontSize * style.headingScale * 10) / 10}pt headings`}
                >
                    <NumberInput
                        min={1}
                        max={4}
                        step={0.05}
                        value={style.headingScale}
                        onChange={headingScale => patch({ headingScale: headingScale ?? fallback.headingScale })}
                        aria-label="Heading scale"
                    />
                </Field>
                <Field label="Heading face">
                    <Select<string>
                        value={style.headingFamily ?? 'body'}
                        options={[{ value: 'body', label: 'Same as body' }, ...familyOptions]}
                        onChange={value =>
                            patch({ headingFamily: value === 'body' ? undefined : (value as FontFamily) })
                        }
                        aria-label="Heading typeface"
                    />
                </Field>
                <ColorField label="Rules" value={style.ruleColor} onChange={ruleColor => patch({ ruleColor })} />
                <Field label="Headings">
                    <Switch
                        checked={style.headingUppercase ?? false}
                        onChange={on => patch({ headingUppercase: on || undefined })}
                        label="In capitals"
                    />
                </Field>
            </div>

            <h4 className="tp-subheading">Related-list tables</h4>
            <div className="tp-grid tp-grid--3">
                <ColorField
                    label="Header fill"
                    value={table.headerFill ?? ''}
                    onChange={headerFill => patchTable({ headerFill: headerFill || undefined })}
                    allowEmpty
                />
                <ColorField
                    label="Header text"
                    value={table.headerColor ?? ''}
                    onChange={headerColor => patchTable({ headerColor: headerColor || undefined })}
                    allowEmpty
                />
                <ColorField
                    label="Every other row"
                    value={table.zebra ?? ''}
                    onChange={zebra => patchTable({ zebra: zebra || undefined })}
                    allowEmpty
                />
                <ColorField label="Grid" value={table.gridColor} onChange={gridColor => patchTable({ gridColor })} />
                <Field label="Cell padding (pt)">
                    <NumberInput
                        min={1}
                        max={24}
                        value={table.cellPadding}
                        onChange={cellPadding => patchTable({ cellPadding: cellPadding ?? 5 })}
                        aria-label="Cell padding"
                    />
                </Field>
                <div className="tp-stack tp-stack--tight tp-field">
                    <Switch
                        checked={table.headerUppercase ?? false}
                        onChange={on => patchTable({ headerUppercase: on || undefined })}
                        label="Capital headings"
                    />
                    <Switch
                        checked={table.rowLines}
                        onChange={rowLines => patchTable({ rowLines })}
                        label="Rule under every row"
                    />
                </div>
            </div>
        </Collapsible>
    )
}

/* ------------------------------------------------------------- letterhead */

export function LetterheadSection({ template, onChange, open, onToggle }: SectionProps) {
    const header: PdfHeader = template.header ?? {}
    const patch = (changes: Partial<PdfHeader>) => {
        const next = { ...header, ...changes }
        const empty = !next.logo && !next.text && !next.rule
        onChange({ ...template, header: empty ? undefined : next })
    }

    const summary =
        header.logo || header.text
            ? [header.logo ? 'logo' : '', header.text ? 'text' : '', header.firstPageOnly ? 'first page' : 'every page']
                  .filter(Boolean)
                  .join(' · ')
            : 'none'

    return (
        <Collapsible title="Letterhead" summary={summary} open={open} onToggle={onToggle}>
            <ImagePicker
                value={header.logo ?? ''}
                onChange={logo => patch({ logo: logo || undefined })}
                hint="Drawn in the top margin of every page. A taller logo needs a bigger top margin."
            />
            <div className="tp-grid tp-grid--3">
                <Field label="Logo width (pt)">
                    <NumberInput
                        min={8}
                        max={400}
                        value={header.logoWidth ?? 110}
                        onChange={logoWidth => patch({ logoWidth })}
                        aria-label="Logo width"
                    />
                </Field>
                <Field label="Logo side">
                    <Select<'left' | 'right'>
                        value={header.logoAlign ?? 'left'}
                        options={[
                            { value: 'left', label: 'Left' },
                            { value: 'right', label: 'Right' },
                        ]}
                        onChange={side => patch({ logoAlign: side === 'right' ? 'right' : undefined })}
                        aria-label="Logo side"
                    />
                </Field>
                <ColorField
                    label="Text colour"
                    value={header.color ?? ''}
                    onChange={color => patch({ color: color || undefined })}
                    allowEmpty
                />
            </div>
            <Field label="Text" hint="Opposite the logo, one line each. Tokens work here.">
                <TokenField
                    multiline
                    rows={3}
                    value={header.text ?? ''}
                    onChange={text => patch({ text: text || undefined })}
                    placeholder={'Acme IT Operations\n{{user.name}} · {{now.date}}'}
                />
            </Field>
            <div className="tp-row tp-row--wrap" style={{ gap: 'var(--tp-space-5)' }}>
                <Switch checked={header.rule ?? false} onChange={rule => patch({ rule: rule || undefined })} label="Rule under it" />
                <Switch
                    checked={header.firstPageOnly ?? false}
                    onChange={first => patch({ firstPageOnly: first || undefined })}
                    label="First page of each record only"
                />
            </div>
        </Collapsible>
    )
}

/* -------------------------------------------------------------- watermark */

export function WatermarkSection({ template, onChange, open, onToggle }: SectionProps) {
    const watermark: PdfWatermark = template.watermark ?? { text: '' }
    const patch = (changes: Partial<PdfWatermark>) => {
        const next = { ...watermark, ...changes }
        onChange({ ...template, watermark: next.text.trim() ? next : undefined })
    }

    return (
        <Collapsible title="Watermark" summary={template.watermark?.text || 'none'} open={open} onToggle={onToggle}>
            <Field label="Text" hint="Stamped under every page. Empty removes it. {{record.state}} stamps what the record is.">
                <TokenField value={watermark.text} onChange={text => patch({ text })} placeholder="DRAFT" maxLength={60} />
            </Field>
            <div className="tp-grid tp-grid--4">
                <ColorField
                    label="Colour"
                    value={watermark.color ?? ''}
                    onChange={color => patch({ color: color || undefined })}
                    allowEmpty
                />
                <Field label="Size (pt)">
                    <NumberInput min={8} max={400} value={watermark.size ?? 84} onChange={size => patch({ size })} aria-label="Watermark size" />
                </Field>
                <Field label="Opacity">
                    <NumberInput
                        min={0.01}
                        max={1}
                        step={0.01}
                        value={watermark.opacity ?? 0.08}
                        onChange={opacity => patch({ opacity })}
                        aria-label="Watermark opacity"
                    />
                </Field>
                <Field label="Angle (°)">
                    <NumberInput min={-90} max={90} step={5} value={watermark.angle ?? 45} onChange={angle => patch({ angle })} aria-label="Watermark angle" />
                </Field>
            </div>
            <Switch
                checked={watermark.uppercase ?? false}
                onChange={uppercase => patch({ uppercase: uppercase || undefined })}
                label="In capitals"
            />
        </Collapsible>
    )
}

/* ----------------------------------------------------------------- footer */

export function FooterSection({ template, onChange, open, onToggle }: SectionProps) {
    const footer = template.footer
    const patch = (changes: Partial<PdfTemplate['footer']>) => onChange({ ...template, footer: { ...footer, ...changes } })
    return (
        <Collapsible
            title="Footer"
            summary={[footer.text || '', footer.showPageNumbers ? 'page numbers' : ''].filter(Boolean).join(' · ') || 'none'}
            open={open}
            onToggle={onToggle}
        >
            <Field label="Text" hint="In the bottom margin of every page. Tokens work here.">
                <TokenField value={footer.text} onChange={text => patch({ text })} placeholder="{{record.number}} · {{now.date}}" />
            </Field>
            <Switch
                checked={footer.showPageNumbers}
                onChange={showPageNumbers => patch({ showPageNumbers })}
                label="Page numbers — counted per record"
            />
        </Collapsible>
    )
}
