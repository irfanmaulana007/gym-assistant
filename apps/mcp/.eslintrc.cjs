/* ESLint for the MCP server (Node + TypeScript). */
module.exports = {
  root: true,
  env: { node: true, es2022: true },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs', 'vitest.config.ts'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
  },
}
