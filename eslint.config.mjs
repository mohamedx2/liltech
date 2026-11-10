import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/out-tsc', '**/vitest.config.*.timestamp*'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // Apps may depend on shared libraries, never on each other.
            {
              sourceTag: 'scope:web',
              onlyDependOnLibsWithTags: ['scope:shared', 'type:contract', 'type:util'],
            },
            {
              sourceTag: 'scope:api',
              onlyDependOnLibsWithTags: ['scope:shared', 'type:contract', 'type:util'],
            },
            // Shared libraries must not depend on applications.
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
            // Contracts are standalone: no app code, no runtime frameworks.
            {
              sourceTag: 'type:contract',
              onlyDependOnLibsWithTags: ['type:contract'],
            },
            // Generic catch-all (keep last).
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
      // Backend must never import frontend code and vice versa — covered by
      // the boundary rules above. Explicit strictness rules:
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
];
