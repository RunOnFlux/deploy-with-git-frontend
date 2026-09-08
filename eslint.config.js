import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `dist-ssr` is this project's SSR build output — the name vite.config.js gives it and the
  // one .gitignore already excludes. The list was copied from a sibling site whose SSR output
  // is `.ssr`, so it never covered ours: 17 files of generated, minified bundle were being
  // linted, and they accounted for more than half of every problem reported.
  globalIgnores(['dist', 'dist-ssr', 'trash']),
  {
    files: ['server.js', 'vite.config.js'],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    ignores: ['server.js', 'vite.config.js'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // ESLint CORE DOES NOT SEE JSX. `<Zap />` is not a reference as far as `no-unused-vars`
      // is concerned — proved by removing the exemption below, which immediately reports an
      // imported icon rendered on the next line. `varsIgnorePattern`'s leading `^[A-Z_]` is
      // this project's workaround for that, and it is why imported components do not all
      // report unused.
      //
      // The workaround was never extended to ARGUMENTS, so the same identifier destructured
      // out of a parameter — `({ icon: Icon })`, rendered as `<Icon />` two lines later —
      // was reported thirteen times across six files. Capitalised args are exempt on exactly
      // the same grounds as capitalised vars, which is a blunt instrument in both places: a
      // genuinely unused capitalised binding slips through either way.
      //
      // The real fix is `eslint-plugin-react`'s `jsx-uses-vars`, which teaches the rule to
      // read JSX. That is a new dependency and none of the five sibling Flux sites has it, so
      // it belongs in a decision taken across all six rather than here alone.
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]|^motion$|^unused|^set[A-Z].*|^navigate$|^useMemo$|^useCallback$',
        argsIgnorePattern: '^_|^[A-Z]',
        destructuredArrayIgnorePattern: '^_',
      }],
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'off',
      'no-useless-catch': 'warn',
      'react-refresh/only-export-components': 'warn',
    },
  },
])
