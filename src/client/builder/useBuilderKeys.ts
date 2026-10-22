import { useEffect, useRef } from 'react'
import type { CustomSlide, SlideElement } from '../engine/presentation'
import type { Slide } from '../slides/paginate'
import type { SlideEditor } from './editor'
import { offsetCopies, styleOf, type CopiedStyle } from './operations'

/** Elements copied with Ctrl+C, kept for pasting onto any slide of any presentation in this tab. */
let clipboard: SlideElement[] = []

/** A look copied with Ctrl+Shift+C, for Ctrl+Shift+V onto anything else. */
let copiedStyle: CopiedStyle | null = null

const isTyping = (target: EventTarget | null) => {
    const element = target as HTMLElement | null
    return Boolean(element && (/^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName) || element.isContentEditable))
}

/** Everything the builder's keys act on, as of the latest render. */
export type BuilderKeys = {
    /** True while the presenter is up: it has keys of its own. */
    presenting: boolean
    slides: Slide[]
    index: number
    choose: (key: string) => void
    save: () => void
    undo: () => void
    redo: () => void
    present: (fromCurrent: boolean) => void
    editor: SlideEditor | null
    custom: CustomSlide | undefined
    selection: string[]
    setSelection: (ids: string[]) => void
    setEditing: (id: string | null) => void
    painter: CopiedStyle | null
    setPainter: (style: CopiedStyle | null) => void
    paint: (ids: string[], style: CopiedStyle | null) => void
    place: (elements: SlideElement[]) => void
    toast: (message: string, tone?: 'info' | 'critical') => void
}

/**
 * The slide builder's keyboard: saving, undo, presenting and moving between
 * slides anywhere in it, and copying, pasting, nudging and formatting on the
 * slide being edited. The handler reads the latest render's state through a
 * ref, so it is attached once.
 */
export function useBuilderKeys(state: BuilderKeys) {
    const latest = useRef(state)
    latest.current = state

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => handle(event, latest.current)
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])
}

function handle(event: KeyboardEvent, state: BuilderKeys) {
    const { slides, index, editor, custom, selection } = state
    if (event.defaultPrevented || state.presenting || isTyping(event.target) || document.querySelector('.tp-modal'))
        return
    const target = event.target as HTMLElement | null
    // An open menu has its own arrow keys and Escape.
    if (target?.closest?.('[role="menu"]')) return
    // Enter, Delete and the arrows belong to a focused button or choice; on the slide they move things.
    const onControl = Boolean(target?.closest?.('button, a, [role="radiogroup"]'))
    const mod = event.metaKey || event.ctrlKey
    const key = event.key.toLowerCase()

    if (mod && key === 's') {
        event.preventDefault()
        state.save()
        return
    }
    if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) {
        event.preventDefault()
        state.redo()
        return
    }
    if (mod && key === 'z') {
        event.preventDefault()
        state.undo()
        return
    }
    if (event.key === 'F5') {
        event.preventDefault()
        state.present(event.shiftKey)
        return
    }
    const step = (by: number) => {
        const next = slides[index + by]
        if (next) state.choose(next.key)
    }
    if (event.key === 'PageDown' || (!selection.length && event.key === 'ArrowDown')) {
        event.preventDefault()
        step(1)
        return
    }
    if (event.key === 'PageUp' || (!selection.length && event.key === 'ArrowUp')) {
        event.preventDefault()
        step(-1)
        return
    }
    if (!editor || !custom) return

    const picked = custom.elements.filter(element => selection.includes(element.id))
    if (onControl && !mod) return
    if (mod && event.shiftKey && key === 'c' && picked.length === 1) {
        event.preventDefault()
        copiedStyle = styleOf(picked[0]!)
        state.toast('Formatting copied. Select something and press Ctrl+Shift+V to paste it.', 'info')
    } else if (mod && event.shiftKey && key === 'v' && copiedStyle && picked.length) {
        event.preventDefault()
        state.paint(selection, copiedStyle)
    } else if (mod && key === 'k' && picked.length === 1) {
        event.preventDefault()
        document.getElementById('tp-element-link')?.focus()
    } else if (event.key === 'Escape' && state.painter) {
        state.setPainter(null)
    } else if (mod && key === 'a') {
        event.preventDefault()
        state.setSelection(custom.elements.map(element => element.id))
    } else if (mod && (key === 'c' || key === 'x') && picked.length) {
        event.preventDefault()
        clipboard = structuredClone(picked)
        if (key === 'x') editor.remove()
    } else if (mod && key === 'v' && clipboard.length) {
        event.preventDefault()
        // Pasted where it was copied from when that place is free; offset when the original is still there.
        const onTop = clipboard.some(copied => custom.elements.some(element => element.id === copied.id))
        state.place(offsetCopies(clipboard, onTop ? 12 : 0))
    } else if (mod && key === 'd' && picked.length) {
        event.preventDefault()
        editor.duplicate()
    } else if (mod && (key === 'b' || key === 'i' || key === 'u') && picked.some(element => element.type === 'shape')) {
        event.preventDefault()
        const prop = key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline'
        const on = picked.every(element => element.type === 'shape' && element[prop])
        editor.patch(element => (element.type === 'shape' ? { [prop]: on ? undefined : true } : {}))
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && picked.length) {
        event.preventDefault()
        editor.remove()
    } else if (event.key.startsWith('Arrow') && picked.length) {
        event.preventDefault()
        const by = event.shiftKey ? 10 : 1
        const dx = event.key === 'ArrowLeft' ? -by : event.key === 'ArrowRight' ? by : 0
        const dy = event.key === 'ArrowUp' ? -by : event.key === 'ArrowDown' ? by : 0
        editor.patch(element => ({ x: element.x + dx, y: element.y + dy }), 'nudge')
    } else if (event.key === 'Enter' && picked.length === 1 && picked[0]!.type === 'shape') {
        event.preventDefault()
        state.setEditing(picked[0]!.id)
    } else if (event.key === 'Enter' && picked.length === 1 && picked[0]!.type === 'table') {
        event.preventDefault()
        state.setEditing(`${picked[0]!.id}#0,0`)
    } else if (event.key === 'Escape' && selection.length) {
        state.setSelection([])
    }
}
