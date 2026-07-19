import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Allow unused vars that start with _ (common for express next/err params)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Allow explicit `any` where necessary (e.g. error handlers)
      "@typescript-eslint/no-explicit-any": "warn",
      // Don't require explicit return types on all functions (too verbose for Express)
      "@typescript-eslint/explicit-function-return-type": "off",
      // Allow require() only in config files — server is CJS
      "@typescript-eslint/no-require-imports": "off",
      "no-console": "warn",
    },
  },
);
