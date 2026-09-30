import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname
});

const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "desktop-bundle/**", "dist-desktop/**", "next-env.d.ts"]
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["desktop/**/*.cjs", "tests/desktop*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" }
  }
];

export default eslintConfig;
