import React, { useEffect, useState } from 'react'
import { RecordPicker } from '../designer/RecordPicker'
import { useAsync } from '../hooks/useAsync'
import { RecordService } from '../services/records'
import { SchemaService, type TableSchema } from '../services/schema'
import { Button, Field, IconButton, Notice, Spinner } from '../ui/controls'
import { Modal } from '../ui/overlays'

type Chosen = { sysId: string; label: string }

/**
 * Sharing a presentation: the people and groups who can change it as well as
 * its author. Everyone with Templater can already open and present it; this
 * is about who else may edit it. Only its author or an editor can change it.
 */
export function ShareModal({
    editors,
    editorGroups,
    busy,
    onClose,
    onSave,
}: {
    editors: string[]
    editorGroups: string[]
    busy: boolean
    onClose: () => void
    onSave: (editors: string[], editorGroups: string[]) => void
}) {
    const users = useAsync(() => SchemaService.table('sys_user'), [])
    const groups = useAsync(() => SchemaService.table('sys_user_group'), [])
    const [people, setPeople] = useState<Chosen[]>([])
    const [teams, setTeams] = useState<Chosen[]>([])

    // What it is shared with already, by name.
    useEffect(() => {
        if (users.data) void labelled(users.data, editors).then(setPeople)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [users.data])
    useEffect(() => {
        if (groups.data) void labelled(groups.data, editorGroups).then(setTeams)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groups.data])

    return (
        <Modal
            open
            title="Share this presentation"
            onClose={onClose}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        icon="save"
                        busy={busy}
                        onClick={() =>
                            onSave(
                                people.map(person => person.sysId),
                                teams.map(team => team.sysId)
                            )
                        }
                    >
                        Save sharing
                    </Button>
                </>
            }
        >
            <div className="tp-stack">
                <p>
                    Everyone who uses Templater can open and present this presentation. The people and groups here can
                    change it too.
                </p>
                <Notice kind="critical" lines={[users.error, groups.error].filter(Boolean) as string[]} />
                {!users.data || !groups.data ? (
                    <div className="tp-loading">
                        <Spinner /> Reading people and groups…
                    </div>
                ) : (
                    <>
                        <ChosenList
                            label="People"
                            schema={users.data}
                            chosen={people}
                            onChange={setPeople}
                            placeholder="Add a person"
                        />
                        <ChosenList
                            label="Groups"
                            schema={groups.data}
                            chosen={teams}
                            onChange={setTeams}
                            placeholder="Add a group"
                        />
                    </>
                )}
            </div>
        </Modal>
    )
}

async function labelled(schema: TableSchema, ids: string[]): Promise<Chosen[]> {
    return Promise.all(
        ids.map(sysId =>
            RecordService.summary(schema.name, sysId, schema.displayField, false)
                .then(summary => ({ sysId, label: summary.label }))
                .catch(() => ({ sysId, label: sysId }))
        )
    )
}

function ChosenList({
    label,
    schema,
    chosen,
    onChange,
    placeholder,
}: {
    label: string
    schema: TableSchema
    chosen: Chosen[]
    onChange: (chosen: Chosen[]) => void
    placeholder: string
}) {
    return (
        <Field label={label}>
            <div className="tp-stack tp-stack--tight">
                {chosen.length > 0 && (
                    <ul className="tp-share__list">
                        {chosen.map(entry => (
                            <li key={entry.sysId} className="tp-row tp-row--between">
                                <span className="tp-truncate">{entry.label}</span>
                                <IconButton
                                    icon="x"
                                    size="sm"
                                    label={`Stop sharing with ${entry.label}`}
                                    onClick={() => onChange(chosen.filter(item => item.sysId !== entry.sysId))}
                                />
                            </li>
                        ))}
                    </ul>
                )}
                <RecordPicker
                    schema={schema}
                    value=""
                    placeholder={placeholder}
                    aria-label={placeholder}
                    onChange={(sysId, name) =>
                        sysId &&
                        !chosen.some(entry => entry.sysId === sysId) &&
                        onChange([...chosen, { sysId, label: name || sysId }])
                    }
                />
            </div>
        </Field>
    )
}
