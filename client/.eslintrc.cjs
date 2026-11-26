module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    // Props are documented in comments; PropTypes are deprecated (removed in React 19).
    'react/prop-types': 'off',
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
  overrides: [
    {
      // Tooling files run in Node, not the browser.
      files: ['vite.config.js', 'postcss.config.js', 'tailwind.config.js'],
      env: { node: true },
    },
    {
      // Vitest globals (describe, it, expect, vi) are enabled in vite.config.js.
      files: ['tests/**', 'src/**/*.test.{js,jsx}'],
      env: { node: true },
      globals: { describe: 'readonly', it: 'readonly', test: 'readonly', expect: 'readonly', vi: 'readonly', beforeEach: 'readonly', afterEach: 'readonly', beforeAll: 'readonly', afterAll: 'readonly' },
    },
  ],
}
