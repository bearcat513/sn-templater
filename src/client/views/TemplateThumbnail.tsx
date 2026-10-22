import React, { useEffect, useRef, useState } from 'react'
import { useSession } from '../data/session'
import { specimenJob } from '../data/loader'
import { openTemplate } from '../data/templates'
import type { PdfTemplate } from '../engine/template'
import { recordFieldPaths } from '../engine/vocabulary'
import type { TableSchema } from '../services/schema'
import { TemplateService, type TemplateRecord } from '../services/templates'
import { paginate, type Slide } from '../slides/paginate'
import { SlideView } from '../slides/SlideView'
import { Icon, type IconName } from '../ui/icons'

type Drawn = { template: PdfTemplate; slide: Slide } | null

/**
 * A stand-in for the table's schema, made from the fields the template uses —
 * each labelled with its own name — so a thumbnail needs no request for the
 * table as well.
 */
function schemaFor(template: PdfTemplate, record: TemplateRecord): TableSchema {
    const names = [...new Set(recordFieldPaths(template).map(path => path.split('.')[0]!))]
    return {
        name: record.table,
        label: record.tableLabel || record.table,
        displayField: '',
        ancestors: [record.table],
        fields: names.map(name => ({ name, label: name.replace(/_/g, ' '), type: 'string' })),
        relationships: [],
    }
}

/** Drawn thumbnails, by template and version: a published template does not change under its version. */
const drawn = new Map<string, Promise<Drawn>>()

/**
 * The first page or slide of a template, small, with every field showing its
 * own name — so a list of templates can be told apart at a glance. Drawn by
 * the same renderer as the slide preview, and only once the card scrolls
 * into view; a chart, which would have to count records to be drawn, keeps
 * its icon.
 */
export function TemplateThumbnail({
    template,
    icon,
    width,
}: {
    template: TemplateRecord
    icon: IconName
    width: number
}) {
    const session = useSession()
    const box = useRef<HTMLDivElement>(null)
    const [visible, setVisible] = useState(false)
    const [thumbnail, setThumbnail] = useState<Drawn>(null)

    useEffect(() => {
        const element = box.current
        if (!element || template.kind === 'chart') return
        if (typeof IntersectionObserver === 'undefined') {
            setVisible(true)
            return
        }
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                setVisible(true)
                observer.disconnect()
            }
        })
        observer.observe(element)
        return () => observer.disconnect()
    }, [template.kind])

    useEffect(() => {
        if (!visible) return
        const key = `${template.sysId}:${template.version}:${template.modCount}`
        let pending = drawn.get(key)
        if (!pending) {
            pending = (async () => {
                const full = await TemplateService.get(template.sysId)
                const read = await openTemplate(full, [])
                if (!read.ok) return null
                const job = specimenJob(read.value, schemaFor(read.value, full), session, full.name)
                const first = paginate(read.value, job)[0]
                return first ? { template: read.value, slide: first } : null
            })().catch(() => null)
            drawn.set(key, pending)
        }
        let live = true
        void pending.then(result => live && setThumbnail(result))
        return () => {
            live = false
        }
    }, [visible, template, session])

    return (
        <div className="tp-thumbnail" ref={box} style={{ width }} aria-hidden="true">
            {thumbnail ? (
                <SlideView template={thumbnail.template} slide={thumbnail.slide} width={width} />
            ) : (
                <span className={`tp-thumbnail__icon tp-kind--${template.kind}`}>
                    <Icon name={icon} size={22} />
                </span>
            )}
        </div>
    )
}
