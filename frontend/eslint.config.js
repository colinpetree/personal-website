// Frontend lint, run by CI (ci.yml, lint job) and locally with `npm run lint`.
//
// Rules chosen to catch real bugs (undefined names, broken hook order,
// missing list keys, unused code), not to enforce a style.
import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['build/', 'dist/', 'node_modules/', '.react-router/', 'verify-header.js'] },

  js.configs.recommended,

  // App code: browser + JSX.
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      // process: apiFetch.js reads PRERENDER_BASE_URL during the Node prerender.
      globals: { ...globals.browser, process: 'readonly' },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      // JSX awareness, so components used only in JSX count as used.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'off',
      'react/jsx-key': 'error',
      'react/jsx-no-undef': 'error',
      'react/jsx-no-duplicate-props': 'error',
      'react/no-children-prop': 'error',
      'react/no-danger-with-children': 'error',
      'react/no-direct-mutation-state': 'error',
      'react/jsx-no-target-blank': 'error',

      // Hooks called conditionally or out of order break React at runtime.
      'react-hooks/rules-of-hooks': 'error',
      // Warn only: the code already opts out where a dependency is left out
      // on purpose (eslint-disable-line comments).
      'react-hooks/exhaustive-deps': 'warn',

      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
    },
  },

  // Node scripts and config files. The verify-* scripts also hold code that
  // Playwright runs inside the page (page.evaluate), hence browser globals.
  {
    files: ['scripts/**/*.{js,mjs}', '*.config.{js,mjs}', 'src/**/*.test.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['scripts/verify-*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
]
