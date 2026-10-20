import React, { useLayoutEffect, useRef } from 'react'
import { chartData, layoutChart, resolveChart } from '../engine/chart'
import { pageDimensions } from '../engine/pdf'
import { safeUrl } from '../engine/links'
import {
    CARD_EDGE,
    CARD_PADDING,
    CODE_FAMILY,
    CODE_LINE_HEIGHT,
    CODE_PADDING,
    DEFAULT_CODE_BACKGROUND,
    chartStyle,
    codeLines,
    listIndent,
    referenceLink,
    resolvePage,
    resolveStyle,
} from '../engine/render'
import {
    calloutColors,
    referenceToken,
    relatedKey,
    type PdfBlock,
    type PdfPageSetup,
    type PdfStyle,
    type PdfTemplate,
} from '../engine/template'
import { fillTokens } from '../engine/tokens'
import { ChartSvg } from './Chart'
import { FONT_STACKS, FreeformContent } from './Freeform'
import type { Slide } from './paginate'

/**
 * A page of a template, drawn in HTML.
 *
 * The PDF is the file; this is the screen. It reads the same template and the
 * same resolved values and lays them out by the same rules — points become
 * pixels one for one on a sheet of the template's own size, and the sheet is
 * then scaled to whatever width it is shown at. So a deck presented in the
 * browser and the PDF exported from it agree on everything but the pixels.
 *
 * Where a slide holds more than fits, the content is scaled down to fit
 * rather than cut off: a projector has no second page to flow onto.
 *
 * A custom slide has no flow to fit: its elements are drawn where they were
 * placed (see ./Freeform.tsx), on its own background, and with the
 * template's letterhead, watermark and footer only if it asked for them.
 */

type Props = {
    /** The deck's template. A slide from a section placed in the deck brings its own. */
    template: PdfTemplate
    slide: Slide
    /** Shown width in CSS pixels. The height follows the paper. */
    width: number
    className?: string
    /** The builder's canvas: placeholders shown, and the text being edited left out. */
    editing?: { placeholders: boolean; hideTextOf?: string }
    /**
     * In the presenter: how many of a custom slide's build steps are shown,
     * and which one has just appeared and should animate in. Absent is all of
     * them, still — a thumbnail, the builder.
     */
    builds?: { shown: number; animate?: number }
    /** Links open when clicked. Only the presenter wants this. */
    interactive?: boolean
}

export function SlideView({ template: deckTemplate, slide, width, className, editing, builds, interactive }: Props) {
    const template = slide.template ?? deckTemplate
    const page = resolvePage(template)
    const style = resolveStyle(template, page.fontSize)
    const sheet = pageDimensions(page.size, page.landscape)
    const scale = width / sheet.width
    const fill = (text: string, extra?: Record<string, string>) =>
        fillTokens(text, extra ? { ...slide.values, ...extra } : slide.values)

    const content = useRef<HTMLDivElement>(null)
    const contentHeight = sheet.height - page.margins.top - page.margins.bottom

    // Shrink to fit, measured at full size on every render: the natural height
    // is read with the transform off, then the transform is put back.
    useLayoutEffect(() => {
        const element = content.current
        if (!element) return
        element.style.transform = 'none'
        element.style.width = '100%'
        const natural = element.scrollHeight
        const fit = natural > contentHeight ? Math.max(0.4, contentHeight / natural) : 1
        element.style.transform = fit < 1 ? `scale(${fit})` : 'none'
        element.style.width = fit < 1 ? `${100 / fit}%` : '100%'
    })

    const custom = slide.custom
    const furnished = !custom || custom.furniture === true
    const watermark = furnished && template.watermark?.text ? fill(template.watermark.text) : ''
    const footer = furnished && template.footer?.text ? fill(template.footer.text) : ''
    const showNumbers = furnished && template.footer?.showPageNumbers !== false

    return (
        <div
            className={`tp-sheet${className ? ` ${className}` : ''}`}
            style={{ width, height: sheet.height * scale }}
            aria-label={`${slide.label}${slide.parts > 1 ? `, part ${slide.part} of ${slide.parts}` : ''}`}
            role="img"
        >
            <div
                className="tp-sheet__paper"
                style={{
                    width: sheet.width,
                    height: sheet.height,
                    transform: `scale(${scale})`,
                    background: custom?.background || page.background || '#ffffff',
                    color: page.textColor,
                    fontFamily: FONT_STACKS[page.family],
                    fontSize: page.fontSize,
                }}
            >
                {watermark && (
                    <div
                        className="tp-sheet__watermark"
                        style={{
                            color: template.watermark?.color ?? page.accentColor,
                            opacity: template.watermark?.opacity ?? 0.08,
                            fontSize: template.watermark?.size ?? 84,
                            transform: `translate(-50%, -50%) rotate(${-(template.watermark?.angle ?? 45)}deg)`,
                        }}
                    >
                        {template.watermark?.uppercase ? watermark.toUpperCase() : watermark}
                    </div>
                )}

                {furnished && (
                    <Letterhead template={template} page={page} sheetWidth={sheet.width} fill={fill} slide={slide} />
                )}

                {custom ? (
                    <div className="tp-sheet__free">
                        <FreeformContent
                            slide={custom}
                            charts={slide.charts ?? {}}
                            chartStyle={chartStyle(page, custom.background || page.background)}
                            family={page.family}
                            fill={fill}
                            editing={editing}
                            builds={builds}
                            linkBase={interactive ? slide.values['url.instance'] || '' : undefined}
                        />
                    </div>
                ) : (
                <div
                    className="tp-sheet__content"
                    style={{
                        top: page.margins.top,
                        left: page.margins.left,
                        width: sheet.width - page.margins.left - page.margins.right,
                        height: contentHeight,
                    }}
                >
                    <div ref={content} className="tp-sheet__flow">
                        {slide.blocks.map((block, index) => (
                            <Block
                                key={index}
                                block={block}
                                page={page}
                                style={style}
                                fill={fill}
                                slide={slide}
                                contentWidth={sheet.width - page.margins.left - page.margins.right}
                                interactive={interactive}
                            />
                        ))}
                    </div>
                </div>
                )}

                {(footer || showNumbers) && (
                    <div
                        className="tp-sheet__footer"
                        style={{
                            top: sheet.height - page.margins.bottom + 14,
                            left: page.margins.left,
                            right: page.margins.right,
                            fontSize: Math.max(6, page.fontSize - 2),
                            color: page.mutedColor,
                        }}
                    >
                        <span>{footer}</span>
                        {showNumbers && (
                            <span>
                                Page {slide.part} of {slide.parts}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

/* ------------------------------ letterhead ------------------------------ */

function Letterhead({
    template,
    page,
    sheetWidth,
    fill,
    slide,
}: {
    template: PdfTemplate
    page: PdfPageSetup
    sheetWidth: number
    fill: (text: string) => string
    slide: Slide
}) {
    const header = template.header
    if (!header || (!header.logo && !header.text && !header.rule)) return null
    if (header.firstPageOnly && slide.part !== 1) return null

    const baseline = page.margins.top - 20
    const band = Math.max(0, baseline)
    const logoLeft = header.logoAlign !== 'right'
    const text = header.text ? fill(header.text) : ''

    return (
        <>
            <div
                className="tp-sheet__letterhead"
                style={{
                    left: page.margins.left,
                    right: page.margins.right,
                    height: band,
                    flexDirection: logoLeft ? 'row' : 'row-reverse',
                }}
            >
                {header.logo ? (
                    <img
                        src={header.logo}
                        alt=""
                        style={{
                            width: Math.min(header.logoWidth ?? 110, sheetWidth),
                            maxHeight: band,
                            objectFit: 'contain',
                            objectPosition: logoLeft ? 'left bottom' : 'right bottom',
                        }}
                    />
                ) : (
                    <span />
                )}
                {text && (
                    <div
                        style={{
                            textAlign: logoLeft ? 'right' : 'left',
                            fontSize: Math.max(6, page.fontSize - 1.5),
                            lineHeight: 1.35,
                            color: header.color ?? page.mutedColor,
                            whiteSpace: 'pre-line',
                        }}
                    >
                        {text}
                    </div>
                )}
            </div>
            {header.rule && (
                <div
                    className="tp-sheet__rule"
                    style={{
                        top: baseline + 20 / 3,
                        left: page.margins.left,
                        right: page.margins.right,
                        borderTopColor: page.accentColor,
                    }}
                />
            )}
        </>
    )
}

/* -------------------------------- blocks -------------------------------- */

type BlockProps = {
    block: PdfBlock
    page: PdfPageSetup
    style: PdfStyle
    fill: (text: string, extra?: Record<string, string>) => string
    slide: Slide
    contentWidth: number
    interactive?: boolean
}

/** A link on the sheet: an anchor in the presenter, a span that looks like one everywhere else. */
function Linked({
    url,
    interactive,
    style,
    children,
}: {
    url: string | null
    interactive?: boolean
    style?: React.CSSProperties
    children: React.ReactNode
}) {
    if (!url) return <span style={style}>{children}</span>
    const look = { ...style, textDecoration: 'underline', color: 'inherit' }
    return interactive ? (
        <a href={url} target="_blank" rel="noreferrer noopener" style={look} className="tp-sheet__link">
            {children}
        </a>
    ) : (
        <span style={look}>{children}</span>
    )
}

function Block({ block, page, style, fill, slide, contentWidth, interactive }: BlockProps) {
    const headingFamily = style.headingFamily ? FONT_STACKS[style.headingFamily] : undefined

    switch (block.type) {
        case 'heading': {
            const text = fill(block.text)
            return (
                <div
                    className="tp-sheet__text"
                    style={{
                        fontSize: block.size ?? page.fontSize * style.headingScale,
                        fontWeight: 700,
                        color: block.color ?? page.accentColor,
                        textAlign: block.align ?? 'left',
                        lineHeight: Math.max(1, style.lineHeight - 0.1),
                        marginBottom: block.spaceAfter ?? style.paragraphSpacing,
                        fontFamily: headingFamily,
                    }}
                >
                    {style.headingUppercase ? text.toUpperCase() : text}
                </div>
            )
        }

        case 'text':
            return (
                <div
                    className="tp-sheet__text"
                    style={{
                        fontSize: block.size ?? page.fontSize,
                        fontWeight: block.bold ? 700 : 400,
                        fontStyle: block.italic ? 'italic' : 'normal',
                        color: block.color ?? page.textColor,
                        textAlign: block.align ?? 'left',
                        lineHeight: style.lineHeight,
                        marginBottom: block.spaceAfter ?? style.paragraphSpacing,
                    }}
                >
                    {fill(block.text)}
                </div>
            )

        case 'image':
            if (!block.source) return null
            return (
                <div style={{ textAlign: block.align ?? 'left', marginBottom: block.spaceAfter ?? 6 }}>
                    <img
                        src={block.source}
                        alt={block.caption ? fill(block.caption) : ''}
                        style={{ width: Math.min(block.width || 120, contentWidth), display: 'inline-block' }}
                    />
                    {block.caption && (
                        <div
                            style={{
                                fontSize: page.fontSize - 2,
                                color: page.mutedColor,
                                lineHeight: style.lineHeight,
                                marginTop: 2,
                            }}
                        >
                            {fill(block.caption)}
                        </div>
                    )}
                </div>
            )

        case 'spacer':
            return <div style={{ height: Math.max(0, Math.min(block.height, 400)) }} />

        case 'divider':
            return (
                <div
                    style={{
                        margin: '6px 0',
                        borderTop: `${block.thickness ?? 0.75}px solid ${block.color ?? style.ruleColor}`,
                    }}
                />
            )

        case 'columns': {
            const columns = block.columns.length ? block.columns : [{ text: '' }]
            return (
                <div style={{ display: 'flex', gap: block.gap ?? 16, marginBottom: 6 }}>
                    {columns.map((column, index) => (
                        <div key={index} style={{ flex: 1, minWidth: 0, textAlign: column.align ?? 'left' }}>
                            {column.heading && (
                                <div
                                    style={{
                                        fontSize: page.fontSize - 1.5,
                                        fontWeight: 700,
                                        color: page.mutedColor,
                                        marginBottom: 2,
                                        lineHeight: 1.35,
                                    }}
                                >
                                    {fill(column.heading)}
                                </div>
                            )}
                            <div className="tp-sheet__text" style={{ lineHeight: style.lineHeight }}>
                                {fill(column.text)}
                            </div>
                        </div>
                    ))}
                </div>
            )
        }

        case 'fields': {
            const rows = block.rows.filter(row => row.label || row.value)
            if (!rows.length) return null
            const labelWidth = Math.min(160, contentWidth * 0.35)
            return (
                <div style={{ marginBottom: 4 }}>
                    {rows.map((row, index) => (
                        <div
                            key={index}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: `${labelWidth}px 1fr`,
                                minHeight: page.fontSize * 1.5,
                            }}
                        >
                            <div style={{ color: page.mutedColor, lineHeight: style.lineHeight }}>
                                {fill(row.label)}
                            </div>
                            <div className="tp-sheet__text" style={{ lineHeight: style.lineHeight }}>
                                {fill(row.value)}
                            </div>
                        </div>
                    ))}
                </div>
            )
        }

        case 'relatedList':
            return <RelatedList block={block} page={page} style={style} fill={fill} slide={slide} />

        case 'stats': {
            const items = block.items.slice(0, 6)
            if (!items.length) return null
            const accent = block.color ?? page.accentColor
            return (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
                        gap: 16,
                        marginBottom: 10,
                    }}
                >
                    {items.map((item, index) => (
                        <div key={index} style={{ borderTop: `2px solid ${accent}`, paddingTop: 8 }}>
                            <div
                                style={{
                                    fontSize: Math.max(6, page.fontSize * 0.75),
                                    fontWeight: 700,
                                    color: page.mutedColor,
                                    textTransform: 'uppercase',
                                    marginBottom: 3,
                                    lineHeight: 1.35,
                                }}
                            >
                                {fill(item.label)}
                            </div>
                            <div
                                className="tp-sheet__text"
                                style={{ fontSize: page.fontSize * 1.9, fontWeight: 700, lineHeight: 1.15 }}
                            >
                                {fill(item.value)}
                            </div>
                        </div>
                    ))}
                </div>
            )
        }

        case 'signatures': {
            const parties = block.parties.length ? block.parties : [{ label: 'Signature' }]
            return (
                <div style={{ display: 'flex', gap: 24, marginTop: 18, minHeight: 34 }}>
                    {parties.map((party, index) => (
                        <div
                            key={index}
                            style={{ flex: 1, borderTop: `0.75px solid ${style.ruleColor}`, paddingTop: 5 }}
                        >
                            <div style={{ fontSize: page.fontSize - 1 }}>{fill(party.label)}</div>
                            {party.caption && (
                                <div style={{ fontSize: page.fontSize - 2, color: page.mutedColor }}>
                                    {fill(party.caption)}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )
        }

        case 'reference': {
            if (!block.field) return null
            const sysId = slide.values[`raw.${block.field}`] ?? ''
            if (!sysId.trim()) {
                return block.emptyText ? (
                    <div style={{ fontSize: page.fontSize - 0.5, fontStyle: 'italic', color: page.mutedColor, marginBottom: 6 }}>
                        {fill(block.emptyText)}
                    </div>
                ) : null
            }
            const accent = block.color ?? page.accentColor
            const url = referenceLink(block, slide.values)
            const title = block.title ? fill(block.title) : ''
            const rows = block.rows.map(row => ({ label: fill(row.label), value: fill(referenceToken(block, row.field)) }))
            const card = block.layout !== 'plain'
            const labelWidth = card
                ? Math.min(140, (contentWidth - CARD_EDGE - CARD_PADDING * 2) * 0.38)
                : Math.min(160, contentWidth * 0.35)
            return (
                <div
                    className={card ? 'tp-sheet__card' : undefined}
                    style={
                        card
                            ? {
                                  borderColor: style.table.gridColor,
                                  borderLeftColor: accent,
                                  borderLeftWidth: CARD_EDGE,
                                  padding: CARD_PADDING,
                                  marginBottom: 10,
                              }
                            : { marginBottom: 8 }
                    }
                >
                    {title && (
                        <div
                            className="tp-sheet__text"
                            style={{
                                fontSize: page.fontSize + 1,
                                fontWeight: 700,
                                color: accent,
                                lineHeight: style.lineHeight,
                                marginBottom: rows.length ? 4 : 0,
                                fontFamily: headingFamily,
                            }}
                        >
                            <Linked url={url} interactive={interactive}>
                                {title}
                            </Linked>
                        </div>
                    )}
                    {rows.map((row, index) => (
                        <div
                            key={index}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: `${labelWidth}px 1fr`,
                                marginBottom: card ? 2 : 0,
                                minHeight: card ? undefined : page.fontSize * 1.5,
                            }}
                        >
                            <div className="tp-sheet__text" style={{ color: page.mutedColor, lineHeight: style.lineHeight, paddingRight: 6 }}>
                                {row.label}
                            </div>
                            <div className="tp-sheet__text" style={{ lineHeight: style.lineHeight }}>
                                {row.value}
                            </div>
                        </div>
                    ))}
                </div>
            )
        }

        case 'code': {
            const source = fill(block.code)
            const title = block.title ? fill(block.title) : ''
            if (!source.trim() && !title.trim()) return null
            const size = block.size ?? Math.max(6, page.fontSize - 1)
            const lines = codeLines(source)
            const gutter = block.lineNumbers ? String(lines.length).length + 2 : 0
            return (
                <div
                    className="tp-sheet__code"
                    style={{
                        background: block.background ?? DEFAULT_CODE_BACKGROUND,
                        color: block.color ?? '#18181b',
                        padding: CODE_PADDING,
                        marginBottom: block.spaceAfter ?? 8,
                        fontSize: size,
                    }}
                >
                    {title && (
                        <div
                            style={{
                                fontFamily: FONT_STACKS[page.family],
                                fontSize: Math.max(6, size - 1),
                                fontWeight: 700,
                                color: page.mutedColor,
                                height: size * 1.6,
                            }}
                        >
                            {title}
                        </div>
                    )}
                    {lines.map((line, index) => (
                        <div
                            key={index}
                            className="tp-sheet__code-line"
                            style={{
                                fontFamily: FONT_STACKS[CODE_FAMILY],
                                lineHeight: CODE_LINE_HEIGHT,
                                paddingLeft: `${gutter * 0.6}em`,
                            }}
                        >
                            {gutter > 0 && (
                                <span className="tp-sheet__code-number" style={{ color: page.mutedColor, width: `${(gutter - 2) * 0.6}em` }}>
                                    {index + 1}
                                </span>
                            )}
                            {line || '\u200b'}
                        </div>
                    ))}
                </div>
            )
        }

        case 'link': {
            const address = fill(block.url)
            const label = fill(block.text)
            const shown = label.trim() ? label : address
            if (!shown.trim()) return null
            const url = safeUrl(address, slide.values['url.instance'])
            return (
                <div
                    className="tp-sheet__text"
                    style={{
                        fontSize: block.size ?? page.fontSize,
                        fontWeight: block.bold ? 700 : 400,
                        color: block.color ?? page.accentColor,
                        textAlign: block.align ?? 'left',
                        lineHeight: style.lineHeight,
                        marginBottom: block.spaceAfter ?? style.paragraphSpacing,
                    }}
                >
                    <Linked url={url} interactive={interactive}>
                        {shown}
                    </Linked>
                </div>
            )
        }

        case 'callout': {
            const colors = calloutColors(block.tone, block.color)
            const title = block.title ? fill(block.title) : ''
            const body = fill(block.text)
            if (!title.trim() && !body.trim()) return null
            return (
                <div
                    style={{
                        background: colors.fill,
                        borderLeft: `${CARD_EDGE}px solid ${colors.color}`,
                        padding: CARD_PADDING,
                        marginBottom: 8,
                        lineHeight: style.lineHeight,
                    }}
                >
                    {title && (
                        <div className="tp-sheet__text" style={{ fontWeight: 700, color: colors.color, marginBottom: body.trim() ? 2 : 0 }}>
                            {title}
                        </div>
                    )}
                    {body.trim() && <div className="tp-sheet__text">{body}</div>}
                </div>
            )
        }

        case 'list': {
            const size = block.size ?? page.fontSize
            const entries = block.items
                .flatMap(item => fill(item).split(/\r?\n/))
                .map(entry => entry.trim())
                .filter(Boolean)
            if (!entries.length) return null
            const indent = listIndent(block.style, size, entries.length)
            return (
                <div style={{ fontSize: size, lineHeight: style.lineHeight, marginBottom: block.spaceAfter ?? style.paragraphSpacing }}>
                    {entries.map((entry, index) => (
                        <div key={index} style={{ display: 'flex', marginBottom: size * 0.25 }}>
                            <span style={{ flex: `0 0 ${indent}px`, position: 'relative' }} aria-hidden="true">
                                {block.style === 'number' ? (
                                    <span style={{ position: 'absolute', right: size * 0.45, color: page.mutedColor }}>{index + 1}.</span>
                                ) : block.style === 'check' ? (
                                    <span
                                        className="tp-sheet__check"
                                        style={{
                                            left: size * 0.05,
                                            top: `calc(${(style.lineHeight - 1) / 2}em + ${size * 0.12}px)`,
                                            width: size * 0.72,
                                            height: size * 0.72,
                                            borderColor: page.mutedColor,
                                            borderRadius: size * 0.13,
                                        }}
                                    />
                                ) : (
                                    <span style={{ position: 'absolute', left: size * 0.15, color: page.accentColor }}>•</span>
                                )}
                            </span>
                            <span className="tp-sheet__text" style={{ flex: 1, minWidth: 0 }}>
                                {entry}
                            </span>
                        </div>
                    ))}
                </div>
            )
        }

        case 'table': {
            const table = style.table
            const total = block.columns.reduce((sum, column) => sum + Math.max(0, column.width), 0) || 1
            const headers = block.columns.map(column => fill(column.header))
            if (!block.rows.length && !headers.some(header => header.trim())) return null
            const zebra = block.zebra ?? table.zebra
            return (
                <table className="tp-sheet__table" style={{ fontSize: block.fontSize ?? page.fontSize - 0.5, marginBottom: 8 }}>
                    <colgroup>
                        {block.columns.map((column, index) => (
                            <col key={index} style={{ width: `${(Math.max(0, column.width) / total) * 100}%` }} />
                        ))}
                    </colgroup>
                    {headers.some(header => header.trim()) && (
                        <thead>
                            <tr style={{ background: block.headerFill ?? table.headerFill, borderBottom: '0.75px solid #a1a1aa' }}>
                                {block.columns.map((column, index) => (
                                    <th
                                        key={index}
                                        style={{
                                            padding: table.cellPadding,
                                            textAlign: column.align ?? 'left',
                                            color: table.headerColor ?? page.mutedColor,
                                        }}
                                    >
                                        {table.headerUppercase ? headers[index]!.toUpperCase() : headers[index]}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                    )}
                    <tbody>
                        {block.rows.map((row, rowIndex) => (
                            <tr
                                key={rowIndex}
                                style={{
                                    background: zebra && rowIndex % 2 === 1 ? zebra : undefined,
                                    borderBottom: table.rowLines ? `0.5px solid ${table.gridColor}` : undefined,
                                }}
                            >
                                {block.columns.map((column, index) => (
                                    <td key={index} style={{ padding: table.cellPadding, textAlign: column.align ?? 'left', whiteSpace: 'pre-wrap' }}>
                                        {fill(row[index] ?? '')}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )
        }

        case 'chart':
            return <ChartBlockView block={block} page={page} style={style} fill={fill} slide={slide} contentWidth={contentWidth} />

        case 'pageBreak':
            return null
    }
}

/** A chart block: the same title, plot and note the PDF draws, the plot as SVG. */
function ChartBlockView({
    block,
    page,
    style,
    fill,
    slide,
    contentWidth,
}: Omit<BlockProps, 'block' | 'interactive'> & { block: Extract<PdfBlock, { type: 'chart' }> }) {
    const charts = slide.charts ?? {}
    const data = chartData(block, text => fill(text), slide.related, charts)
    const { look, title: titleText, emptyText } = resolveChart(block, charts)
    const extra = data.count === undefined ? undefined : { 'list.count': String(data.count) }
    const title = titleText ? fill(titleText, extra) : ''
    const empty = !data.points.length
    if (empty && !emptyText) return null
    const surface = slide.custom?.background || page.background || '#ffffff'

    return (
        <div style={{ marginBottom: 10 }}>
            {title && (
                <div
                    style={{
                        fontSize: page.fontSize + 2,
                        fontWeight: 700,
                        color: page.accentColor,
                        marginBottom: 6,
                        lineHeight: 1.35,
                        textTransform: style.headingUppercase ? 'uppercase' : undefined,
                        fontFamily: style.headingFamily ? FONT_STACKS[style.headingFamily] : undefined,
                    }}
                >
                    {title}
                </div>
            )}
            {empty ? (
                <div style={{ fontSize: page.fontSize - 0.5, fontStyle: 'italic', color: page.mutedColor }}>
                    {fill(emptyText ?? '', extra)}
                </div>
            ) : (
                <ChartSvg
                    scene={layoutChart(look, data.points, contentWidth, chartStyle(page, surface))}
                    family={page.family}
                    label={title || 'Chart'}
                />
            )}
            {!empty && data.note && (
                <div style={{ marginTop: 4, fontSize: Math.max(6, page.fontSize - 2), color: page.mutedColor }}>
                    {data.note}
                </div>
            )}
        </div>
    )
}

function RelatedList({
    block,
    page,
    style,
    fill,
    slide,
}: Omit<BlockProps, 'block' | 'contentWidth'> & { block: Extract<PdfBlock, { type: 'relatedList' }> }) {
    if (!block.table || !block.field) return null
    const data = slide.related[relatedKey(block)]
    const rows = data?.rows ?? []
    const extra = { 'list.count': String(data?.total ?? rows.length) }
    const table = style.table
    const total = block.columns.reduce((sum, column) => sum + Math.max(0, column.width), 0) || 1
    const size = block.fontSize ?? page.fontSize - 0.5
    const zebra = block.zebra ?? table.zebra
    const fillColor = block.headerFill ?? table.headerFill

    return (
        <div style={{ marginBottom: 8 }}>
            {block.title && (
                <div
                    style={{
                        fontSize: page.fontSize + 2,
                        fontWeight: 700,
                        color: page.accentColor,
                        marginBottom: 4,
                        lineHeight: 1.35,
                        textTransform: style.headingUppercase ? 'uppercase' : undefined,
                        fontFamily: style.headingFamily ? FONT_STACKS[style.headingFamily] : undefined,
                    }}
                >
                    {fill(block.title, extra)}
                </div>
            )}
            {!rows.length || !block.columns.length ? (
                block.emptyText ? (
                    <div style={{ fontSize: page.fontSize - 0.5, fontStyle: 'italic', color: page.mutedColor }}>
                        {fill(block.emptyText, extra)}
                    </div>
                ) : null
            ) : (
                <table className="tp-sheet__table" style={{ fontSize: size }}>
                    <colgroup>
                        {block.columns.map((column, index) => (
                            <col key={index} style={{ width: `${(Math.max(0, column.width) / total) * 100}%` }} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr style={{ background: fillColor, borderBottom: `0.75px solid #a1a1aa` }}>
                            {block.columns.map((column, index) => {
                                const header = fill(column.header, extra)
                                return (
                                    <th
                                        key={index}
                                        style={{
                                            padding: table.cellPadding,
                                            textAlign: column.align ?? 'left',
                                            color: table.headerColor ?? page.mutedColor,
                                        }}
                                    >
                                        {table.headerUppercase ? header.toUpperCase() : header}
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIndex) => (
                            <tr
                                key={rowIndex}
                                style={{
                                    background: zebra && rowIndex % 2 === 1 ? zebra : undefined,
                                    borderBottom: table.rowLines ? `0.5px solid ${table.gridColor}` : undefined,
                                }}
                            >
                                {block.columns.map((column, index) => (
                                    <td
                                        key={index}
                                        style={{ padding: table.cellPadding, textAlign: column.align ?? 'left' }}
                                    >
                                        {row[column.field] ?? ''}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    )
}
