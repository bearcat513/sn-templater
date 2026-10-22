import { useCallback, useState, type RefObject } from 'react'
import { decodeImage } from '../engine/image'
import { prepareImageFile } from '../engine/imageFile'
import { MAX_ELEMENTS, type CustomSlide, type PresentationBody, type SlideElement } from '../engine/presentation'
import type { Sheet, SlideEditor } from './editor'
import {
    addElements,
    align,
    arrange as stack,
    distribute,
    newChart,
    newCodeBox,
    newImage,
    newLine,
    newShape,
    newTable,
    newTextBox,
    offsetCopies,
    patchElements,
    removeElements,
    styleFor,
    styleOf,
    updateSlide,
    type CopiedStyle,
} from './operations'

type Options = {
    /** The custom slide being edited, if the current slide is one. */
    custom: CustomSlide | undefined
    sheet: Sheet | null
    /** Changes the presentation body through the undo history. */
    setBody: (change: (body: PresentationBody) => PresentationBody, merge?: string) => void
    imageInput: RefObject<HTMLInputElement | null>
    toast: (message: string, tone?: 'info' | 'critical') => void
}

/**
 * The editing state of the current custom slide — which elements are
 * selected, which one is being typed in, the format painter — and the
 * `SlideEditor` the ribbon, canvas and inspector work through.
 */
export function useSlideEditor({ custom, sheet, setBody, imageInput, toast }: Options) {
    const [selection, setSelection] = useState<string[]>([])
    const [editing, setEditing] = useState<string | null>(null)
    const [painter, setPainter] = useState<CopiedStyle | null>(null)

    const changeSlide = useCallback(
        (change: (slide: CustomSlide) => CustomSlide, merge?: string) => {
            if (!custom) return
            const id = custom.id
            setBody(body => updateSlide(body, id, change), merge)
        },
        [custom, setBody]
    )

    const place = (elements: SlideElement[], edit = false) => {
        if (!custom) return
        if (custom.elements.length + elements.length > MAX_ELEMENTS) {
            toast(`A slide can hold at most ${MAX_ELEMENTS} things.`, 'critical')
            return
        }
        changeSlide(current => addElements(current, elements))
        setSelection(elements.map(element => element.id))
        setEditing(edit && elements.length === 1 ? elements[0]!.id : null)
    }

    const placeImage = async (file: File, at?: [number, number]) => {
        if (!sheet) return
        const prepared = await prepareImageFile(file)
        if (!prepared.ok) {
            toast(prepared.error, 'critical')
            return
        }
        const decoded = decodeImage(prepared.image.source)
        if (!decoded.ok) {
            toast(decoded.error, 'critical')
            return
        }
        const element = newImage(sheet, prepared.image.source, decoded.image)
        if (at) {
            element.x = Math.round(at[0] - element.w / 2)
            element.y = Math.round(at[1] - element.h / 2)
        }
        place([element])
        if (prepared.image.note) toast(`Picture prepared for the PDF: ${prepared.image.note}.`, 'info')
    }

    /** Paints the copied look onto elements, as the format painter does when one is clicked. */
    const paint = (ids: string[], style: CopiedStyle | null) => {
        if (!style || !ids.length) return
        changeSlide(current => patchElements(current, ids, element => styleFor(element, style)))
    }

    /** Leaves the slide: nothing selected, nothing being typed in, the painter put down. */
    const reset = () => {
        setSelection([])
        setEditing(null)
        setPainter(null)
    }

    const editor: SlideEditor | null =
        custom && sheet
            ? {
                  slide: custom,
                  sheet,
                  selection,
                  selected: custom.elements.filter(element => selection.includes(element.id)),
                  select: ids => {
                      setSelection(ids)
                      setEditing(null)
                  },
                  change: changeSlide,
                  patch: (patch, merge) => changeSlide(current => patchElements(current, selection, patch), merge),
                  insertText: () => place([newTextBox(sheet)], true),
                  insertShape: shape => place([newShape(sheet, shape)]),
                  insertLine: arrow => place([newLine(sheet, arrow)]),
                  insertCode: () => place([newCodeBox(sheet)], true),
                  insertTable: (rows, columns) => place([newTable(sheet, rows, columns)]),
                  insertImage: file => (file ? void placeImage(file) : imageInput.current?.click()),
                  insertChart: template => place([newChart(sheet, template)]),
                  painter,
                  togglePainter: () => {
                      if (painter) return setPainter(null)
                      const source = custom.elements.find(element => selection.includes(element.id))
                      if (source) setPainter(styleOf(source))
                  },
                  remove: () => {
                      changeSlide(current => removeElements(current, selection))
                      setSelection([])
                      setEditing(null)
                  },
                  duplicate: () => {
                      const copies = offsetCopies(custom.elements.filter(element => selection.includes(element.id)))
                      if (copies.length) place(copies)
                  },
                  arrange: how => changeSlide(current => stack(current, selection, how)),
                  align: how => changeSlide(current => align(current, selection, how, sheet)),
                  distribute: axis => changeSlide(current => distribute(current, selection, axis)),
              }
            : null

    return {
        editor,
        selection,
        setSelection,
        editing,
        setEditing,
        painter,
        setPainter,
        changeSlide,
        place,
        placeImage,
        paint,
        reset,
    }
}
