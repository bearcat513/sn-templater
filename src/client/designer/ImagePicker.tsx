import React, { useRef, useState } from 'react'
import { decodeImage } from '../engine/image'
import { describeSize, prepareImageFile } from '../engine/imageFile'
import { Icon } from '../ui/icons'
import { Button, Notice, Spinner, cx } from '../ui/controls'

type Props = {
    /** A `data:` URL, or "" for nothing chosen yet. */
    value: string
    onChange: (source: string) => void
    hint?: string
}

/**
 * Choosing a picture for a template — a logo, a diagram.
 *
 * Ported from cpq-vibes' ImagePicker. The conversion is the substance: what
 * anyone has to hand is an RGBA logo or a 4000-pixel export, and a PDF takes
 * neither, so `prepareImageFile` flattens and re-encodes in the browser. The
 * stored value is a `data:` URL — the thumbnail is the same bytes the PDF will
 * carry, with nothing in between to disagree.
 */
export function ImagePicker({ value, onChange, hint }: Props) {
    const input = useRef<HTMLInputElement>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [note, setNote] = useState('')
    const [dragging, setDragging] = useState(false)

    const decoded = value ? decodeImage(value) : null
    const summary =
        decoded?.ok === true
            ? `${decoded.image.width}×${decoded.image.height} · ${describeSize(decoded.image.byteLength)} · ${decoded.image.mediaType.replace('image/', '')}`
            : ''

    const accept = async (file: File | undefined) => {
        if (!file) return
        setBusy(true)
        setError('')
        setNote('')
        try {
            const prepared = await prepareImageFile(file)
            if (!prepared.ok) {
                setError(prepared.error)
                return
            }
            onChange(prepared.image.source)
            if (prepared.image.note) setNote(`Prepared for print: ${prepared.image.note}.`)
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'That image could not be read.')
        } finally {
            setBusy(false)
            if (input.current) input.current.value = ''
        }
    }

    return (
        <div className="tp-stack tp-stack--tight">
            <div
                className={cx('tp-image-picker', dragging && 'is-dragging')}
                onDragOver={event => {
                    event.preventDefault()
                    setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={event => {
                    event.preventDefault()
                    setDragging(false)
                    void accept(event.dataTransfer.files[0])
                }}
            >
                <div className="tp-image-picker__thumb">
                    {busy ? (
                        <Spinner size={16} />
                    ) : value ? (
                        <img src={value} alt="" />
                    ) : (
                        <Icon name="image" size={20} />
                    )}
                </div>
                <div className="tp-grow tp-stack tp-stack--tight">
                    <div className="tp-row tp-row--wrap">
                        <Button size="sm" icon="upload" onClick={() => input.current?.click()} disabled={busy}>
                            {value ? 'Replace' : 'Choose an image'}
                        </Button>
                        {value && (
                            <Button
                                size="sm"
                                variant="ghost"
                                icon="trash"
                                onClick={() => {
                                    onChange('')
                                    setNote('')
                                    setError('')
                                }}
                            >
                                Remove
                            </Button>
                        )}
                    </div>
                    <p className="tp-subtle tp-truncate">
                        {summary || 'PNG or JPEG. Drop one here, or choose a file.'}
                    </p>
                </div>
                <input
                    ref={input}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={event => void accept(event.target.files?.[0])}
                />
            </div>
            <Notice kind="critical" lines={error ? [error] : []} />
            <Notice kind="info" lines={note ? [note] : []} />
            {hint && <p className="tp-subtle">{hint}</p>}
        </div>
    )
}
