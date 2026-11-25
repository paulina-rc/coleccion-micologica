import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser, // window, document, fetch…
    },
    rules: {
      eqeqeq: 'error', // obliga a usar === (evita comparaciones raras de JS)
      'no-var': 'error', // solo let / const
      'prefer-const': 'warn',
    },
  },
];
