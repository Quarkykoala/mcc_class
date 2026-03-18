import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.d.ts',
      'coverage/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ...(config.languageOptions ?? {}),
      parserOptions: {
        ...(config.languageOptions?.parserOptions ?? {}),
        projectService: true
      }
    },
    rules: {
      ...(config.rules ?? {}),
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'error'
    }
  }))
];
