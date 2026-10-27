/**
 * Keeps the Templater script include pointed at the module of this version.
 *
 * Server modules are installed under a path with the app's version in it
 * (x_1040823_template/templater/<version>/…), and the script include loads
 * its code by that path. `npm version` runs this after it changes
 * package.json, so the two move together; the constants test fails the
 * build if they ever do not.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const file = new URL('../src/fluent/script-includes/templater.server.js', import.meta.url)
const source = readFileSync(file, 'utf8')
const next = source.replace(
    /Templater\.MODULE = '[^']*';/,
    `Templater.MODULE = 'x_1040823_template/${pkg.name}/${pkg.version}/src/server/templater/index.ts';`
)
if (next === source) {
    console.log(`[version] the script include already loads ${pkg.version}`)
} else {
    writeFileSync(file, next)
    console.log(`[version] the script include now loads ${pkg.version}`)
}
