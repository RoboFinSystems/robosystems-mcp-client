import eslint from '@eslint/js'
import prettierConfig from 'eslint-config-prettier'
import prettierPlugin from 'eslint-plugin-prettier'

export default [
  // Global ignores
  {
    ignores: ['dist/', 'build/', 'node_modules/', 'coverage/', '*.config.js', '*.config.mjs'],
  },
  // Base ESLint recommended rules
  eslint.configs.recommended,
  // Prettier config (disables conflicting rules)
  prettierConfig,
  // Custom configuration
  {
    plugins: {
      prettier: prettierPlugin,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Node.js globals
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        // Web/Node globals
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        EventSource: 'readonly',
        TextDecoder: 'readonly',
        // ES2022 globals
        globalThis: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'prettier/prettier': 'error',
    },
  },
]
