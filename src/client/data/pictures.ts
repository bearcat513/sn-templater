/**
 * Pictures kept as attachments.
 *
 * A body used to carry its pictures inside it as `data:` URLs, which made
 * every read of a template carry every logo, and every save resend them. Now
 * a picture is an attachment on the template or presentation it belongs to,
 * named by a hash of its content, and the body names it:
 * `attachment:templater-3f9a….png`.
 *
 * The editors and renderers still work in `data:` URLs — a PDF needs the
 * bytes, synchronously — so a body is *opened* by swapping each reference for
 * its picture (`openPictures`) and *saved* by uploading any picture the record
 * does not have yet and swapping it back for a reference (`storePictures`).
 * The same picture twice is one attachment; an unchanged picture is never
 * uploaded again. A body with `data:` URLs in it still opens as it is, and
 * moves its pictures into attachments the next time it is saved.
 *
 * Attachments are never deleted here: a template's earlier versions name
 * the pictures they had, and restoring one should find them.
 */
import { PICTURE_PREFIX } from '../../server/shared/constants'
import { PICTURE_REF, isPictureRef } from '../engine/image'
import { AttachmentService } from '../services/attachments'
import { log } from '../debug/log'

const PREFIX = PICTURE_PREFIX

/** Opened pictures, by record and name: a picture does not change under its name. */
const cache = new Map<string, Promise<string | null>>()

/**
 * The reference each picture opened or stored on this page was read from,
 * by its `data:` URL: what lets a local copy of unsaved work name a picture
 * rather than carry it (see `referPictures`).
 */
const references = new Map<string, string>()

const DATA_URL = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=\s]+)$/

function toBase64(bytes: Uint8Array): string {
    let binary = ''
    for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
    return btoa(binary)
}

const fromBase64 = (text: string): Uint8Array =>
    Uint8Array.from(atob(text.replace(/\s+/g, '')), char => char.charCodeAt(0))

async function hashOf(text: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return [...new Uint8Array(digest)]
        .slice(0, 12)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('')
}

/** Every string in a body, rewritten — the body's shape is not this file's business. */
async function rewrite<T>(value: T, change: (text: string) => Promise<string>): Promise<T> {
    if (typeof value === 'string') return (await change(value)) as T
    if (Array.isArray(value)) return (await Promise.all(value.map(item => rewrite(item, change)))) as T
    if (value && typeof value === 'object') {
        const entries = await Promise.all(
            Object.entries(value as Record<string, unknown>).map(async ([key, item]) => [
                key,
                await rewrite(item, change),
            ])
        )
        return Object.fromEntries(entries) as T
    }
    return value
}

/** The same as `rewrite`, for a change that needs no waiting. */
function rewriteNow<T>(value: T, change: (text: string) => string): T {
    if (typeof value === 'string') return change(value) as T
    if (Array.isArray(value)) return value.map(item => rewriteNow(item, change)) as T
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, rewriteNow(item, change)])
        ) as T
    }
    return value
}

/**
 * A body with every picture that is already an attachment named rather
 * than carried: what is kept of unsaved work in the browser, which has room
 * for the text of a deck but not for its photographs. Pictures added since
 * the last save are not attachments yet, and stay as they are.
 */
export const referPictures = <T>(body: T): T =>
    references.size ? rewriteNow(body, text => references.get(text) ?? text) : body

/** A body with the pictures that are still `data:` URLs taken out, and how many there were. */
export function dropNewPictures<T>(body: T): { body: T; dropped: number } {
    let dropped = 0
    const out = rewriteNow(body, text => {
        if (!DATA_URL.test(text)) return text
        dropped++
        return ''
    })
    return { body: out, dropped }
}

/**
 * A body with its pictures in it: each attachment reference swapped for the
 * picture as a `data:` URL. A picture that cannot be read stays a reference,
 * which the renderer reports as a picture it could not draw.
 */
export async function openPictures<T>(body: T, table: string, sysId: string): Promise<T> {
    if (!sysId || !JSON.stringify(body).includes('"attachment:')) return body
    const files = AttachmentService.list(table, sysId, PREFIX).then(
        list => new Map(list.map(file => [file.fileName, file]))
    )
    return rewrite(body, async text => {
        const name = PICTURE_REF.exec(text)?.[1]
        if (!name) return text
        const key = `${sysId}/${name}`
        let picture = cache.get(key)
        if (!picture) {
            picture = files
                .then(async found => {
                    const file = found.get(name)
                    if (!file) return null
                    const type = name.endsWith('.png') ? 'image/png' : 'image/jpeg'
                    const url = `data:${type};base64,${toBase64(await AttachmentService.file(file.sysId))}`
                    references.set(url, `attachment:${name}`)
                    return url
                })
                .catch(failure => {
                    log.warn('pictures', `Could not read ${name}`, failure)
                    cache.delete(key)
                    return null
                })
            cache.set(key, picture)
        }
        return (await picture) ?? text
    })
}

/**
 * A body ready to save: each `data:` URL picture uploaded to the record —
 * unless it already has it — and swapped for a reference to it.
 */
export async function storePictures<T>(body: T, table: string, sysId: string): Promise<T> {
    if (!JSON.stringify(body).includes('"data:image/')) return body
    const existing = AttachmentService.list(table, sysId, PREFIX).then(list => new Set(list.map(file => file.fileName)))
    const uploads = new Map<string, Promise<void>>()
    return rewrite(body, async text => {
        const match = DATA_URL.exec(text)
        if (!match || isPictureRef(text)) return text
        const [, type, data] = match
        const name = `${PREFIX}${await hashOf(text)}.${type === 'image/png' ? 'png' : 'jpg'}`
        let upload = uploads.get(name)
        if (!upload) {
            upload = existing.then(async names => {
                if (names.has(name)) return
                await AttachmentService.upload(table, sysId, name, fromBase64(data!), type!)
                log.info('pictures', `Stored ${name} on ${table}/${sysId}`)
            })
            uploads.set(name, upload)
        }
        await upload
        cache.set(`${sysId}/${name}`, Promise.resolve(text))
        references.set(text, `attachment:${name}`)
        return `attachment:${name}`
    })
}
