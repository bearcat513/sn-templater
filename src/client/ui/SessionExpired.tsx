import React, { useEffect, useState } from 'react'
import { refreshSessionToken, SESSION_EXPIRED_EVENT, type SessionExpiredDetail } from '../services/http'
import { Button, Notice } from './controls'
import { Modal } from './overlays'

/**
 * Shown when the instance stops accepting the page's requests because the
 * session has ended. Whatever was being done waits — nothing on screen is
 * lost — while the person signs in again in another tab; "Try again" then
 * picks up the new session and sends the waiting requests.
 */
export function SessionExpired() {
    const [waiting, setWaiting] = useState<SessionExpiredDetail[]>([])
    const [checking, setChecking] = useState(false)
    const [stillOut, setStillOut] = useState(false)

    useEffect(() => {
        const onExpired = (event: Event) => {
            const detail = (event as CustomEvent<SessionExpiredDetail>).detail
            event.preventDefault()
            setWaiting(current => [...current, detail])
        }
        window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
        return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
    }, [])

    const finish = (signedIn: boolean) => {
        for (const entry of waiting) entry.resume(signedIn)
        setWaiting([])
        setStillOut(false)
    }

    const retry = async () => {
        setChecking(true)
        const ok = await refreshSessionToken()
        setChecking(false)
        if (ok) finish(true)
        else setStillOut(true)
    }

    return (
        <Modal
            open={waiting.length > 0}
            title="Sign in again to carry on"
            onClose={() => finish(false)}
            footer={
                <>
                    <Button variant="ghost" onClick={() => finish(false)}>
                        Not now
                    </Button>
                    <Button icon="external" onClick={() => window.open('/login.do', '_blank', 'noopener')}>
                        Sign in in a new tab
                    </Button>
                    <Button variant="primary" busy={checking} onClick={() => void retry()}>
                        Try again
                    </Button>
                </>
            }
        >
            <div className="tp-stack">
                <p>
                    Your session on the instance has ended. Everything on this page is still here, and unsaved changes
                    are also kept in this browser.
                </p>
                <p className="tp-muted">
                    Sign in again in a new tab, come back, and choose Try again: what you were doing — a save, an export
                    — carries on from where it stopped.
                </p>
                <Notice
                    kind="warning"
                    lines={
                        stillOut
                            ? [
                                  'Still signed out. If you have signed in, reload this page: your unsaved changes will be offered back.',
                              ]
                            : []
                    }
                />
            </div>
        </Modal>
    )
}
