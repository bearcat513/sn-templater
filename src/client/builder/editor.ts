import type { CustomSlide, ShapeKind, SlideElement } from '../engine/presentation'
import type { PdfPageSetup } from '../engine/template'
import type { Alignment, Arrange, CopiedStyle } from './operations'

/** The sheet a custom slide is laid out on. */
export type Sheet = { width: number; height: number; page: PdfPageSetup }

/**
 * What the toolbar and the inspector can do to the slide being edited. The
 * builder makes one of these for the current custom slide; everything in it
 * goes through the builder's undo history.
 */
export type SlideEditor = {
    slide: CustomSlide
    sheet: Sheet
    selection: string[]
    selected: SlideElement[]
    select: (ids: string[]) => void
    /** Changes the whole slide. Changes with the same `merge` key in quick succession undo as one. */
    change: (change: (slide: CustomSlide) => CustomSlide, merge?: string) => void
    /** Changes the selected elements. */
    patch: (patch: Partial<SlideElement> | ((element: SlideElement) => Partial<SlideElement>), merge?: string) => void
    insertText: () => void
    insertShape: (shape: ShapeKind) => void
    insertLine: (arrow: boolean) => void
    insertCode: () => void
    insertTable: (rows: number, columns: number) => void
    /** Opens the file picker, or places the file given. */
    insertImage: (file?: File) => void
    /** Places a chart template. */
    insertChart: (template: { sysId: string; name: string }) => void
    /** The format painter's copied look, while it is waiting for an element to be clicked. */
    painter: CopiedStyle | null
    /** Arms the painter with the selected element's look, or puts it down again. */
    togglePainter: () => void
    remove: () => void
    duplicate: () => void
    arrange: (how: Arrange) => void
    align: (how: Alignment) => void
    distribute: (axis: 'x' | 'y') => void
}
