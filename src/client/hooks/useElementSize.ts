import { useLayoutEffect, useState, type RefObject } from 'react'

/** The content-box size of an element, kept current as it resizes. */
export function useElementSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
    const [size, setSize] = useState({ width: 0, height: 0 })

    useLayoutEffect(() => {
        const element = ref.current
        if (!element) return
        const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight })
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(element)
        return () => observer.disconnect()
    }, [ref])

    return size
}
