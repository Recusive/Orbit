import eslint from "@eslint/js"
import { defineConfig } from "eslint/config"
import importPlugin from "eslint-plugin-import-x"
import tseslint from "typescript-eslint"

export default defineConfig(
  {
    ignores: [
      "dist/",
      "node_modules/",
      "*.config.js",
      "*.config.mjs",
      // Reference packages — read-only, do not lint
      "packages/app/",
      "packages/desktop/",
      "packages/ui/",
      "sdks/",
      // Auto-generated SDK code
      "packages/sdk/js/src/gen/",
      "packages/sdk/js/src/v2/gen/",
      // Migration files
      "packages/opencode/migration/",
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: {
      // @ts-expect-error - Plugin types have legacy config format incompatibility
      "import-x": importPlugin,
    },
    rules: {
      /* TypeScript strict — matches Orbit's eslint.config.ts */
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/restrict-template-expressions": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/strict-boolean-expressions": [
        "error",
        { allowNullableBoolean: true, allowNullableString: true },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      /* Disable: conflicts with no-non-null-assertion. When `!` is forbidden,
         `as T` is the only option for non-nullable assertions. */
      "@typescript-eslint/non-nullable-type-assertion-style": "off",

      /* Allow _prefix for intentionally unused variables (interface compliance, destructuring) */
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],

      /* Imports — matches Orbit */
      "import-x/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index", "type"],
          "newlines-between": "always",
          alphabetize: { order: "asc" },
        },
      ],
      "import-x/no-duplicates": "error",
      "import-x/consistent-type-specifier-style": ["error", "prefer-top-level"],

      /* Codebase-specific: namespaces are the primary organizational pattern (upstream fork) */
      "@typescript-eslint/no-namespace": "off",

      /* General — matches Orbit */
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
    },
  },
  /* Test files — relaxed type checking (matches Orbit) */
  {
    files: ["**/test/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-explicit-any": "off",
      /* Bun test types declare expect().rejects as Matchers<unknown> (sync)
         but the runtime is actually thenable — awaiting is correct behavior.
         This also means `await expect(x).rejects.toThrow()` triggers
         no-confusing-void-expression since toThrow() is typed as void. */
      "@typescript-eslint/await-thenable": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      /* Test mocks implement interfaces with async methods but return sync values.
         Non-null assertions are safe after expect().toBeDefined() guards. */
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
    },
  },
  /* CLI commands — console.log is expected user-facing output */
  {
    files: ["packages/opencode/src/cli/**/*.ts", "packages/opencode/src/cli/**/*.tsx"],
    rules: {
      "no-console": "off",
    },
  },
  /* Logging utility — wraps console by design */
  {
    files: ["packages/opencode/src/util/log.ts"],
    rules: {
      "no-console": "off",
    },
  },
  /* Scripts — CLI tools that use console for output */
  {
    files: [
      "script/**/*.ts",
      "packages/opencode/script/**/*.ts",
      "packages/opencode/script/**/*.mjs",
      "packages/script/src/**/*.ts",
    ],
    rules: {
      "no-console": "off",
    },
  },
  /* JS fixture files — no type checking available */
  {
    files: ["**/*.js", "**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  },
  /* .mjs files — no TypeScript annotations, add Node.js globals */
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  },
)
