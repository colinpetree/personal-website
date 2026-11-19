// Frontend unit tests, run by CI (ci.yml, unit job) and locally with
// `npm test`. Kept separate from vite.config.js so the React Router and
// compression plugins (build-only) never load for tests.
//
// Tests live next to the code as *.test.js / *.test.jsx. The default
// environment is plain Node; a test that needs a DOM opts in with a
// `// @vitest-environment jsdom` comment at the top.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    environment: 'node',
  },
})
