import { getJson } from './http'

const API = '/api/x_1040823_template/templater'

/** What the email route needs: the record, the PDF attached to it, and who to tell. */
export type EmailRequest = {
    table: string
    sysId: string
    /** The attachment's sys_id: the PDF, attached to the record. */
    attachment: string
    to: string[]
    subject: string
    message: string
}

export const EmailService = {
    /** Sends a link to an attached PDF. The instance checks the sender can read the record and the file is its. */
    async send(request: EmailRequest): Promise<number> {
        const { result } = await getJson<{ result: { sent: number } }>(`${API}/email`, {
            method: 'POST',
            body: JSON.stringify(request),
        })
        return result.sent
    },
}

/** Addresses typed into one box — commas, semicolons, spaces or new lines between them. */
export const splitAddresses = (text: string): string[] =>
    text
        .split(/[\s,;]+/)
        .map(address => address.trim())
        .filter(Boolean)

export const isEmailAddress = (address: string): boolean =>
    /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/.test(address)
