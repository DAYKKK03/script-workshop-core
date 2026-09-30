import assert from "node:assert/strict";
import test from "node:test";

test("npm test runtime probe receives the test environment", () => {
  assert.equal(process.env.NODE_ENV, "test");
});
