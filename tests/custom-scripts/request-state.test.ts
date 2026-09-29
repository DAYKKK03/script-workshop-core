import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptPendingCustomScriptRequest,
  createOrReusePendingCustomScriptRequest,
  createExplicitRetryCustomScriptRequest,
  customScriptRequestPayload,
  type PendingCustomScriptRequest
} from "../../components/custom-scripts/custom-script-request-state";

const draft = {
  projectId: "project-a",
  requestText: "写一条下午茶口播",
  objective: "trust" as const,
  tone: "natural" as const
};

test("ambiguous regeneration retries reuse the full idempotent payload", () => {
  const first = createOrReusePendingCustomScriptRequest({
    pending: null,
    draft,
    previousScript: "上一版完整脚本",
    createClientRequestId: () => "uuid-a"
  });
  const retry = createOrReusePendingCustomScriptRequest({
    pending: first,
    draft,
    createClientRequestId: () => "uuid-b"
  });
  assert.deepEqual(retry, first);
  assert.equal(retry.clientRequestId, "uuid-a");
  assert.equal(retry.previousScript, "上一版完整脚本");
  assert.deepEqual(customScriptRequestPayload(retry), {
    clientRequestId: "uuid-a",
    ...draft,
    previousScript: "上一版完整脚本"
  });
});

test("clearing conditions starts a new action with a new UUID", () => {
  const cleared: PendingCustomScriptRequest | null = null;
  const next = createOrReusePendingCustomScriptRequest({
    pending: cleared,
    draft: { ...draft, tone: "professional" },
    createClientRequestId: () => "uuid-new"
  });
  assert.equal(next.clientRequestId, "uuid-new");
  assert.equal(next.previousScript, undefined);
});

test("each confirmed regeneration starts a new UUID", () => {
  const firstRegeneration = createOrReusePendingCustomScriptRequest({
    pending: null,
    draft,
    previousScript: "第一版脚本",
    createClientRequestId: () => "uuid-first-regeneration"
  });
  const secondRegeneration = createOrReusePendingCustomScriptRequest({
    pending: null,
    draft,
    previousScript: "第二版脚本",
    createClientRequestId: () => "uuid-second-regeneration"
  });
  assert.notEqual(firstRegeneration.clientRequestId, secondRegeneration.clientRequestId);
  assert.equal(secondRegeneration.previousScript, "第二版脚本");
});

test("failed accepted regeneration retries with a new UUID and the same full business payload", () => {
  const initial = createOrReusePendingCustomScriptRequest({
    pending: null,
    draft,
    createClientRequestId: () => "uuid-initial-success"
  });
  const acceptedInitial = acceptPendingCustomScriptRequest(initial);
  const regeneration = createOrReusePendingCustomScriptRequest({
    pending: null,
    draft: acceptedInitial.draft,
    previousScript: "生成成功的原稿",
    createClientRequestId: () => "uuid-regeneration"
  });

  // POST 202 means the durable job accepted this exact request. A later failed poll
  // must keep the business payload while discarding the accepted idempotency key.
  const lastAcceptedRequest = acceptPendingCustomScriptRequest(regeneration); // POST 202.
  // A later failed poll does not mutate the accepted business payload.
  const retry = createExplicitRetryCustomScriptRequest({
    pending: null,
    lastAcceptedRequest,
    createClientRequestId: () => "uuid-regeneration-retry"
  });

  assert.ok(retry);
  assert.notEqual(retry.clientRequestId, regeneration.clientRequestId);
  assert.notEqual(retry.clientRequestId, initial.clientRequestId);
  assert.deepEqual(customScriptRequestPayload(retry), {
    clientRequestId: "uuid-regeneration-retry",
    ...draft,
    previousScript: "生成成功的原稿"
  });
});

test("ambiguous regeneration POST retry keeps the original UUID", () => {
  const pending = createOrReusePendingCustomScriptRequest({
    pending: null,
    draft,
    previousScript: "生成成功的原稿",
    createClientRequestId: () => "uuid-ambiguous"
  });
  const retry = createExplicitRetryCustomScriptRequest({
    pending,
    lastAcceptedRequest: acceptPendingCustomScriptRequest(pending),
    createClientRequestId: () => "uuid-must-not-be-used"
  });

  assert.equal(retry?.clientRequestId, "uuid-ambiguous");
  assert.equal(retry?.previousScript, "生成成功的原稿");
});
