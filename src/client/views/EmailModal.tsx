import React, { useState } from 'react'
import { useSession } from '../data/session'
import { EmailService, isEmailAddress, splitAddresses } from '../services/email'
import { Button, Field, Input, Notice, Textarea } from '../ui/controls'
import { Modal } from '../ui/overlays'

/**
 * Emailing a PDF: it is attached to its record first (if it is not already),
 * and the email carries a link to it — so the file stays where the record's
 * own access rules guard it, and the email says which record it belongs to.
 */
export function EmailModal({
    open,
    fileName,
    recordLabel,
    onClose,
    attach,
    table,
    sysId,
}: {
    open: boolean
    fileName: string
    recordLabel: string
    onClose: () => void
    /** Attaches the PDF to the record if needed, returning the attachment's sys_id. */
    attach: () => Promise<string>
    table: string
    sysId: string
}) {
    const session = useSession()
    const [to, setTo] = useState('')
    const [subject, setSubject] = useState(`${fileName.replace(/\.pdf$/, '')} — ${recordLabel}`)
    const [message, setMessage] = useState('')
    const [sending, setSending] = useState(false)
    const [error, setError] = useState('')
    const [sent, setSent] = useState(0)

    const addresses = splitAddresses(to)
    const bad = addresses.filter(address => !isEmailAddress(address))

    const send = async () => {
        setSending(true)
        setError('')
        try {
            const attachment = await attach()
            setSent(await EmailService.send({ table, sysId, attachment, to: addresses, subject, message }))
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'The email could not be sent.')
        } finally {
            setSending(false)
        }
    }

    const close = () => {
        setSent(0)
        setError('')
        onClose()
    }

    return (
        <Modal
            open={open}
            title="Email a link to the PDF"
            onClose={close}
            footer={
                sent ? (
                    <Button variant="primary" onClick={close}>
                        Done
                    </Button>
                ) : (
                    <>
                        <Button variant="ghost" onClick={close}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            icon="mail"
                            busy={sending}
                            disabled={!addresses.length || bad.length > 0 || addresses.length > 20}
                            onClick={() => void send()}
                        >
                            Attach and send
                        </Button>
                    </>
                )
            }
        >
            {sent ? (
                <Notice
                    kind="positive"
                    lines={[
                        `Sent to ${sent} ${sent === 1 ? 'person' : 'people'}. The PDF is attached to ${recordLabel}.`,
                    ]}
                />
            ) : (
                <div className="tp-stack">
                    <p className="tp-muted">
                        {fileName} is attached to {recordLabel}, and the email links to it there. Each recipient needs
                        access to the record to open it.
                    </p>
                    <Field
                        label="To"
                        hint="Email addresses, separated by commas. Up to 20."
                        error={bad.length ? `Not an email address: ${bad.join(', ')}` : undefined}
                    >
                        <Textarea rows={2} value={to} onChange={event => setTo(event.target.value)} />
                    </Field>
                    {session.email && !addresses.includes(session.email) && (
                        <div>
                            <Button
                                size="sm"
                                variant="ghost"
                                icon="plus"
                                onClick={() =>
                                    setTo(current => [current.trim(), session.email].filter(Boolean).join(', '))
                                }
                            >
                                Add me ({session.email})
                            </Button>
                        </div>
                    )}
                    <Field label="Subject">
                        <Input value={subject} maxLength={200} onChange={event => setSubject(event.target.value)} />
                    </Field>
                    <Field label="Message" hint="Optional. Shown above the link.">
                        <Textarea
                            rows={4}
                            maxLength={4000}
                            value={message}
                            onChange={event => setMessage(event.target.value)}
                        />
                    </Field>
                    <Notice kind="critical" lines={error ? [error] : []} />
                </div>
            )}
        </Modal>
    )
}
