module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: [
    '@typescript-eslint',
    'react',
    'react-hooks',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    // React 18 不需要显式 import React
    'react/react-in-jsx-scope': 'off',
    // 允许使用 any（渐进式迁移）
    '@typescript-eslint/no-explicit-any': 'warn',
    // 允许未使用的变量以 _ 开头
    '@typescript-eslint/no-unused-vars': ['warn', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],
    // 允许 require 导入（Electron 主进程）
    '@typescript-eslint/no-var-requires': 'off',
    // 允许空函数（错误处理中常见）
    '@typescript-eslint/no-empty-function': 'off',
    // react prop-types 不需要（TypeScript 已覆盖）
    'react/prop-types': 'off',
    // react-hooks 规则
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    // 允许 no-case-declarations（switch 中常用）
    'no-case-declarations': 'off',
    // 允许 console（Electron 应用需要）
    'no-console': 'off',
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'dist-electron/',
    'release/',
    '*.js',
    '*.cjs',
  ],
};
