import React, { useState } from 'react'
import { BLOCK_TYPES, MAX_BLOCKS, blankBlock, type BlockType, type PdfBlock, type TemplateKind } from '../engine/template'
import type { TableSchema } from '../services/schema'
import { Icon, type IconName } from '../ui/icons'
import { IconButton, cx } from '../ui/controls'
import { BlockFields, summarise } from './BlockFields'

const BLOCK_ICONS: Record<BlockType, IconName> = {
    heading: 'file',
    text: 'file',
    fields: 'table',
    columns: 'grid',
    relatedList: 'layers',
    stats: 'sparkle',
    chart: 'chart',
    image: 'image',
    signatures: 'check',
    divider: 'minus',
    spacer: 'minimize',
    pageBreak: 'copy',
    reference: 'external',
    code: 'code',
    link: 'link',
    callout: 'info',
    list: 'list',
    table: 'table',
}

type Props = {
    blocks: PdfBlock[]
    onChange: (blocks: PdfBlock[]) => void
    kind: TemplateKind
    schema: TableSchema
    /** What the list is of, for screen readers: "Record blocks", "Cover blocks". */
    label: string
}

/**
 * The blocks of a template, top to bottom: open one to edit it, drag or use
 * the arrows to move it, and add new ones from the palette underneath.
 */
export function BlockList({ blocks, onChange, kind, schema, label }: Props) {
    const [open, setOpen] = useState<number | null>(null)
    const [dragging, setDragging] = useState<number | null>(null)
    const [over, setOver] = useState<number | null>(null)

    const patch = (index: number, changes: Record<string, unknown>) =>
        onChange(blocks.map((block, at) => (at === index ? ({ ...block, ...changes } as PdfBlock) : block)))

    const move = (from: number, to: number) => {
        if (to < 0 || to >= blocks.length || from === to) return
        const next = [...blocks]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved!)
        onChange(next)
        setOpen(current => (current === from ? to : current))
    }

    const remove = (index: number) => {
        onChange(blocks.filter((_, at) => at !== index))
        setOpen(null)
    }

    const duplicate = (index: number) => {
        const next = [...blocks]
        next.splice(index + 1, 0, structuredClone(blocks[index]!))
        onChange(next)
        setOpen(index + 1)
    }

    const add = (type: BlockType) => {
        onChange([...blocks, blankBlock(type, kind)])
        setOpen(blocks.length)
    }

    return (
        <div className="tp-blocks">
            <ol className="tp-blocks__list" aria-label={label}>
                {blocks.map((block, index) => {
                    const meta = BLOCK_TYPES.find(entry => entry.type === block.type)
                    const expanded = open === index
                    return (
                        <li
                            key={index}
                            className={cx(
                                'tp-block',
                                expanded && 'is-open',
                                dragging === index && 'is-dragging',
                                over === index && dragging !== null && dragging !== index && 'is-over'
                            )}
                            onDragOver={event => {
                                if (dragging === null) return
                                event.preventDefault()
                                setOver(index)
                            }}
                            onDrop={event => {
                                event.preventDefault()
                                if (dragging !== null) move(dragging, index)
                                setDragging(null)
                                setOver(null)
                            }}
                        >
                            <div className="tp-block__header">
                                <span
                                    className="tp-block__grip"
                                    draggable
                                    onDragStart={event => {
                                        setDragging(index)
                                        event.dataTransfer.effectAllowed = 'move'
                                        event.dataTransfer.setData('text/plain', String(index))
                                    }}
                                    onDragEnd={() => {
                                        setDragging(null)
                                        setOver(null)
                                    }}
                                    title="Drag to move"
                                    aria-hidden="true"
                                >
                                    <Icon name="drag" size={14} />
                                </span>
                                <button
                                    type="button"
                                    className="tp-block__toggle"
                                    aria-expanded={expanded}
                                    onClick={() => setOpen(expanded ? null : index)}
                                >
                                    <span className="tp-block__type">
                                        <Icon name={BLOCK_ICONS[block.type]} size={13} />
                                        {meta?.label ?? block.type}
                                    </span>
                                    <span className="tp-block__summary tp-truncate">{summarise(block)}</span>
                                </button>
                                <div className="tp-block__actions">
                                    <IconButton icon="chevronUp" label="Move up" size="sm" disabled={index === 0} onClick={() => move(index, index - 1)} />
                                    <IconButton
                                        icon="chevronDown"
                                        label="Move down"
                                        size="sm"
                                        disabled={index === blocks.length - 1}
                                        onClick={() => move(index, index + 1)}
                                    />
                                    <IconButton icon="copy" label="Duplicate" size="sm" onClick={() => duplicate(index)} />
                                    <IconButton icon="trash" label="Remove" size="sm" tone="danger" onClick={() => remove(index)} />
                                </div>
                            </div>
                            {expanded && (
                                <div className="tp-block__body">
                                    <BlockFields block={block} schema={schema} onChange={changes => patch(index, changes)} />
                                </div>
                            )}
                        </li>
                    )
                })}
            </ol>

            {blocks.length < MAX_BLOCKS && (
                <div className="tp-palette" role="group" aria-label="Add a block">
                    <span className="tp-palette__label">Add</span>
                    {BLOCK_TYPES.map(entry => (
                        <button key={entry.type} type="button" className="tp-chip" title={entry.description} onClick={() => add(entry.type)}>
                            <Icon name="plus" size={12} />
                            {entry.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
