import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.STAGING_BASE_URL;
const originSecret = process.env.STAGING_ORIGIN_SECRET;
const enabled = Boolean(baseUrl && originSecret);

test("standalone runtime serves every CSS and JavaScript asset referenced by the application HTML", {
  skip: enabled ? false : "STAGING_BASE_URL and STAGING_ORIGIN_SECRET are required"
}, async () => {
  assert.ok(baseUrl);
  assert.ok(originSecret);

  const headers = { "X-EdgeOne-Origin-Verify": originSecret };
  const pageResponse = await fetch(new URL("/", baseUrl), { headers });
  assert.equal(pageResponse.status, 200);

  const html = await pageResponse.text();
  const assetPaths = collectStaticAssetPaths(html);
  assert.ok(assetPaths.length > 0, "application HTML must reference static CSS or JavaScript");

  const results = await Promise.all(
    assetPaths.map(async (assetPath) => {
      const response = await fetch(new URL(assetPath, baseUrl), { headers });
      return { assetPath, status: response.status };
    })
  );
  const failures = results.filter(({ status }) => status !== 200);

  assert.deepEqual(
    failures,
    [],
    `all ${assetPaths.length} referenced static assets must return HTTP 200`
  );
});

function collectStaticAssetPaths(html: string) {
  const paths = new Set<string>();
  const attributePattern = /(?:src|href)=["']([^"']+)["']/g;

  for (const match of html.matchAll(attributePattern)) {
    const value = match[1];
    if (/^\/_next\/static\/.*\.(?:css|js)(?:\?.*)?$/.test(value)) {
      paths.add(value);
    }
  }

  return [...paths].sort();
}
