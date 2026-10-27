/**
 * The server-side API for scripts, as a module. The `Templater` script
 * include (src/fluent/script-includes/templater.server.js) loads this and
 * hands every call to it, so scripts keep calling
 * `new x_1040823_template.Templater()` as they always have.
 */
export {
    Templater,
    type TemplaterOptions,
    type TemplateObject,
    type TemplateSpec,
    type VersionObject,
} from './templater.ts'
export { Deck, type Position } from './deck.ts'
export { Slide, type ElementStyle } from './slide.ts'
export { resolvePage, PAGE_DIMENSIONS } from './page.ts'
