import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

const correctnessRules = {
  'constructor-super': 'error',
  'getter-return': 'error',
  'no-async-promise-executor': 'error',
  'no-class-assign': 'error',
  'no-const-assign': 'error',
  'no-dupe-args': 'error',
  'no-dupe-class-members': 'error',
  'no-dupe-keys': 'error',
  'no-func-assign': 'error',
  'no-import-assign': 'error',
  'no-new-native-nonconstructor': 'error',
  'no-obj-calls': 'error',
  'no-promise-executor-return': 'error',
  'no-setter-return': 'error',
  'no-this-before-super': 'error',
  'no-undef': 'error',
  'no-unreachable': 'error',
  'no-unreachable-loop': 'error',
  'no-unsafe-finally': 'error',
  'no-unsafe-negation': 'error',
  'no-with': 'error',
  'require-yield': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
}

export default [
  {
    ignores: ['dist/**', 'companion/webui/**', 'companion/src-tauri/target/**', 'node_modules/**'],
  },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2024 },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...correctnessRules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['src/**/*.test.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Runs inside the dev page, not in Node.
    files: ['scripts/website-shots/seed.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2024 },
    },
    rules: correctnessRules,
  },
  {
    files: ['scripts/**/*.mjs', 'vite.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2024 },
    },
    rules: correctnessRules,
  },
]
