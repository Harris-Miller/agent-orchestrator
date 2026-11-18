import {
  ecmaRules,
  jsTsFilesAll,
  jsTsFilesNode,
  nodeRules,
  reactRules,
  testFiles,
  tsFiles,
  typescriptRules,
  vitestRules,
} from 'oxlint-config-harris';

const commonPlugins = ['eslint', 'import', 'oxc', 'promise'];

export const base = () => [
  {
    files: jsTsFilesAll,
    plugins: commonPlugins,
    rules: {
      ...ecmaRules,
      'eslint/func-names': 'off',
      'eslint/max-classes-per-file': 'off',
      'eslint/no-console': 'off',
    },
  },
  {
    files: tsFiles,
    plugins: ['typescript'],
    rules: {
      ...typescriptRules,
      'typescript/consistent-return': 'off',
      // Without `noUncheckedIndexedAccess` it flags every `=== undefined` check on a Record / array / regex index.
      // TODO: come back and look at this and add `noUncheckedIndexedAccess` to `tsconfig.base.json`
      'typescript/no-unnecessary-condition': 'off',
      // this will be changes to this upstream, remove once done
      'typescript/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true, requireDefaultForNonUnion: true },
      ],
      'typescript/explicit-module-boundary-types': 'off',
    },
  },
];

export const react = () => ({
  files: jsTsFilesAll,
  plugins: ['react', 'jsx-a11y'],
  env: { browser: true },
  rules: {
    ...reactRules,
    'jsx-a11y/prefer-tag-over-role': 'off',
    'react/incompatible-library': 'off',
    'react/only-export-components': 'off',
    'react/preserve-manual-memoization': 'off',
  },
});

export const node = () => ({
  files: jsTsFilesNode,
  plugins: ['node'],
  env: { node: true },
  rules: nodeRules,
});

export const vitest = () => ({
  files: testFiles,
  plugins: ['vitest'],
  env: { vitest: true },
  rules: {
    ...vitestRules,
    'vitest/expect-expect': 'off',
    'vitest/require-mock-type-parameters': 'off',
    'vitest/require-top-level-describe': 'off',
  },
});
