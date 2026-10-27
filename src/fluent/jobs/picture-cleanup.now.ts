import '@servicenow/sdk/global'
import { Property, ScheduledScript } from '@servicenow/sdk/core'
import { cleanUpPictures } from '../../server/picture-cleanup'

/**
 * Pictures are attachments named by their content, and nothing deletes the
 * old ones when a logo changes. Once a week this deletes those that no body,
 * draft or recent version names any more (src/server/picture-cleanup.ts).
 */
export const pictureCleanup = ScheduledScript({
    $id: Now.ID['picture-cleanup'],
    name: 'Clean up Templater pictures',
    frequency: 'weekly',
    dayOfWeek: 'sunday',
    executionTime: { hours: 3, minutes: 0, seconds: 0 },
    script: cleanUpPictures,
})

/** How long a picture named only by an old version is kept. */
export const pictureRetention = Property({
    $id: Now.ID['picture-retention-property'],
    name: 'x_1040823_template.picture_retention_days',
    type: 'integer',
    value: 90,
    description:
        'Days a Templater picture is kept while only versions older than that name it. The weekly "Clean up Templater pictures" job deletes the rest.',
    roles: { write: ['admin'] },
})
