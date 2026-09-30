import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

interface PostcssModule {
  parse(input: string): { toString(): string };
}

const requireFromNext = createRequire(require.resolve("next/package.json"));
const postcss = requireFromNext("postcss") as PostcssModule;
const postcssPackage = requireFromNext("postcss/package.json") as {
  version: string;
};

test("Next uses the patched PostCSS release and escapes closing style tags", () => {
  assert.equal(postcssPackage.version, "8.5.26");

  const output = postcss
    .parse('body { content: "</style><script>alert(1)</script><style>"; }')
    .toString();

  assert.doesNotMatch(output, /<\/style/i);
  assert.match(output, /\\3c \/style/i);
});
