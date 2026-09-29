import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTopicClientRequestId, TopicGenerationJobError } from "../../lib/topics/jobs.ts";

test("accepts and normalizes a UUID client request id", () => {
  assert.equal(
    normalizeTopicClientRequestId("550E8400-E29B-41D4-A716-446655440000"),
    "550e8400-e29b-41d4-a716-446655440000"
  );
});

test("rejects missing and malformed client request ids", () => {
  for (const value of [undefined, "request-1", "550e8400-e29b-01d4-a716-446655440000"]) {
    assert.throws(() => normalizeTopicClientRequestId(value), TopicGenerationJobError);
  }
});
