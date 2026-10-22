import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    {
        ignores: [
            'dist/**',
            'target/**',
            '.now/**',
            '@types/**',
            'node_modules/**',
            'src/fluent/generated/**',
            'src/fluent/templates/**',
            'src/client/engine/fonts/data/**',
            // Script includes and Flow action steps run on the instance as classic Rhino scripts, not modules.
            'src/fluent/script-includes/*.server.js',
            'src/fluent/actions/scripts/*.js',
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/client/**/*.{ts,tsx}'],
        languageOptions: { globals: globals.browser },
        plugins: { 'react-hooks': reactHooks },
        rules: reactHooks.configs.recommended.rules,
    },
    {
        files: ['scripts/**/*.mjs', '*.mjs', '**/*.test.ts'],
        languageOptions: { globals: globals.node },
    },
    {
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            '@typescript-eslint/no-non-null-assertion': 'off',
            'no-empty': ['error', { allowEmptyCatch: true }],
        },
    }
)
