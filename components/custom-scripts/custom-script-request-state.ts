import type { CustomScriptDraft } from "./custom-script-types";

export type PendingCustomScriptRequest = {
  clientRequestId: string;
  draft: CustomScriptDraft;
  previousScript?: string;
};

export type AcceptedCustomScriptRequest = Omit<PendingCustomScriptRequest, "clientRequestId">;

/** Keeps an ambiguous retry byte-for-byte aligned with the original business payload. */
export function createOrReusePendingCustomScriptRequest(input: {
  pending: PendingCustomScriptRequest | null;
  draft: CustomScriptDraft;
  previousScript?: string;
  createClientRequestId: () => string;
}): PendingCustomScriptRequest {
  if (input.pending) return input.pending;
  return {
    clientRequestId: input.createClientRequestId(),
    draft: { ...input.draft },
    ...(input.previousScript ? { previousScript: input.previousScript } : {})
  };
}

export function customScriptRequestPayload(request: PendingCustomScriptRequest) {
  return {
    clientRequestId: request.clientRequestId,
    ...request.draft,
    ...(request.previousScript ? { previousScript: request.previousScript } : {})
  };
}

/** Drops an accepted UUID while retaining the exact business input needed for an explicit retry. */
export function acceptPendingCustomScriptRequest(
  request: PendingCustomScriptRequest
): AcceptedCustomScriptRequest {
  return {
    draft: { ...request.draft },
    ...(request.previousScript ? { previousScript: request.previousScript } : {})
  };
}

/** Reuses an ambiguous POST, but starts a fresh idempotent action after a known terminal result. */
export function createExplicitRetryCustomScriptRequest(input: {
  pending: PendingCustomScriptRequest | null;
  lastAcceptedRequest: AcceptedCustomScriptRequest | null;
  createClientRequestId: () => string;
}): PendingCustomScriptRequest | null {
  if (input.pending) return input.pending;
  if (!input.lastAcceptedRequest) return null;
  return createOrReusePendingCustomScriptRequest({
    pending: null,
    draft: input.lastAcceptedRequest.draft,
    previousScript: input.lastAcceptedRequest.previousScript,
    createClientRequestId: input.createClientRequestId
  });
}
