import { useEffect, useMemo, useRef, useState } from 'react'
import { renderPdfDocument, type PdfRenderResult, type RenderJob } from '../engine/render'
import type { PdfTemplate } from '../engine/template'
import { describeError, log } from '../debug/log'

export type PdfState = {
    /** A blob URL for the last good render, for an iframe or a download link. */
    url: string
    result: PdfRenderResult | null
    /** Why the latest render failed. The last good one stays on screen. */
    error: string
}

/**
 * Renders a template to a PDF and keeps a blob URL for it.
 *
 * The previous URL is revoked on every render and on unmount: a blob URL is a
 * document-lifetime resource, and leaking one per keystroke would hold every
 * intermediate render in memory for the session. A failure is caught and
 * shown, never thrown, and the last good preview stays where it was.
 */
export function usePdf(template: PdfTemplate | null, job: RenderJob | null): PdfState {
    const [url, setUrl] = useState('')
    const previous = useRef('')

    const rendered = useMemo(() => {
        if (!template || !job) return { result: null, error: '' }
        try {
            const done = log.time('render', 'Preview PDF drawn')
            const result = renderPdfDocument(template, job)
            done({
                pages: result.pageCount,
                bytes: result.bytes.length,
                records: job.records.length,
                unknownTokens: result.unknownTokens,
                problems: result.problems,
            })
            return { result, error: '' }
        } catch (failure) {
            const { message, data } = describeError(failure)
            log.error('render', `Preview failed: ${message}`, data)
            return {
                result: null,
                error: failure instanceof Error ? failure.message : 'This template could not be rendered.',
            }
        }
    }, [template, job])

    useEffect(() => {
        if (!rendered.result) return
        const blob = new Blob([rendered.result.bytes as unknown as BlobPart], { type: 'application/pdf' })
        const next = URL.createObjectURL(blob)
        if (previous.current) URL.revokeObjectURL(previous.current)
        previous.current = next
        setUrl(next)
    }, [rendered])

    useEffect(
        () => () => {
            if (previous.current) URL.revokeObjectURL(previous.current)
        },
        []
    )

    const [last, setLast] = useState<PdfRenderResult | null>(null)
    useEffect(() => {
        if (rendered.result) setLast(rendered.result)
    }, [rendered])

    return { url, result: rendered.result ?? last, error: rendered.error }
}

/** Saves bytes as a file, the way a download link would. */
export function downloadBytes(bytes: Uint8Array, fileName: string, type = 'application/pdf') {
    const blob = new Blob([bytes as unknown as BlobPart], { type })
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(href), 10_000)
}
