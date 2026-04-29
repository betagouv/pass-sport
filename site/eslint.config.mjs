import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

const config = [
  ...nextCoreWebVitals,
  prettierConfig,
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': ['error'],
      'react/jsx-curly-brace-presence': ['error', { props: 'never', children: 'never' }],
      // React 19 lint rules introduced by eslint-plugin-react-hooks v6 - downgrade to warn
      // until existing patterns are migrated.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/globals': 'warn',
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'public/**', 'coverage/**'],
  },
];

export default config;
