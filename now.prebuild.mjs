import { servicenowFrontEndPlugins, rollup, glob } from '@servicenow/isomorphic-rollup'

/**
 * Prebuild script for building the client assets of the application before running the rest of the build.
 * Export an async function that accepts useful modules for building the application as arguments.
 * This function returns a Promise that resolves when the build is complete.
 * You can also export an array of functions if you want to run multiple prebuild steps.
 */
export default async ({ rootDir, config, fs, path, logger, registerExplicitId }) => {
    // This is where all the client source files are located
    const clientDir = path.join(rootDir, config.clientDir)
    // Check to make sure we have something to build before we start
    const htmlFilePattern = path.join(clientDir, '**', '*.html')
    const htmlFiles = await glob(htmlFilePattern, { fs })
    if (!htmlFiles.length) {
        logger.warn(`No HTML files found in ${clientDir}, skipping UI build.`)
        return
    }

    // The front-end plugins inline a stylesheet into the bundle only while it is
    // 14 KB or smaller; past that it ships as a separate theme asset (/uxta/…),
    // which does not load on every instance and leaves its styles missing.
    // Split a stylesheet before it gets that big.
    const INLINE_CSS_LIMIT = 14 * 1024
    const oversized = (await glob(path.join(clientDir, '**', '*.css'), { fs })).filter(
        file => fs.statSync(file).size > INLINE_CSS_LIMIT
    )
    if (oversized.length) {
        throw new Error(
            `Stylesheets over ${INLINE_CSS_LIMIT} bytes would not be inlined into the bundle: ` +
                oversized.map(file => `${path.relative(rootDir, file)} (${fs.statSync(file).size} bytes)`).join(', ') +
                '. Split them into smaller files.'
        )
    }

    // This is the destination for the build output
    const staticContentDir = path.join(rootDir, config.staticContent.buildDir)
    // Clean up any previous build output
    fs.rmSync(staticContentDir, { recursive: true, force: true })

    // Call the rollup build
    const rollupBundle = await rollup({
        // Use the file system module provided by the build environment
        fs,
        // Search all HTML files in the client directory to find entry points
        input: htmlFilePattern,
        // Use the default set of ServiceNow plugins for Rollup
        // configured for the scope name and root directory
        plugins: [
            servicenowFrontEndPlugins({
                scope: config.scope,
                rootDir: clientDir,
                projectRootDir: rootDir,
                registerExplicitId,
                // When true -- Pages built with NowSDK will be editable on instance and through Build Agent
                //
                //   Set editableSourceCodeOnInstance to the value below to override
                //   which files are included when deployed to a ServiceNow instance
                //   editableSourceCodeOnInstance: {
                //       excludePatterns: [
                //         '**/node_modules/**',
                //         '**/dist/**',
                //         '**/build/**',
                //         '**/.now/**',
                //         '**/.git/**',
                //         '**/*.min.js',
                //         '**/*.bundle.js',
                //     ],
                //   },
                editableSourceCodeOnInstance: config.packageSourceCodeOnInstance,
            }),
        ],
    })
    // Write the build output to the configured destination
    // including source maps for JavaScript files
    const rollupOutput = await rollupBundle.write({
        dir: staticContentDir,
        sourcemap: true,
    })
    // Print the build results
    rollupOutput.output.forEach(file => {
        if (file.type === 'asset') {
            logger.info(`Bundled asset: ${file.fileName} (${file.source.length} bytes)`)
        } else if (file.type === 'chunk') {
            logger.info(`Bundled chunk: ${file.fileName} (${file.code.length} bytes)`)
        }
    })
}
