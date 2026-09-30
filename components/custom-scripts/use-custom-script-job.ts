"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  acceptPendingCustomScriptRequest,
  createOrReusePendingCustomScriptRequest,
  createExplicitRetryCustomScriptRequest,
  customScriptRequestPayload,
  type AcceptedCustomScriptRequest,
  type PendingCustomScriptRequest
} from "./custom-script-request-state";
import type { CustomScriptDraft, CustomScriptResult, MissingFactCode } from "./custom-script-types";

type JobSnapshot = {
  id: string;
  status: "queued" | "processing" | "succeeded" | "needs_profile" | "failed" | "canceled";
  result?:
    | { status: "success"; finalScript: string; characterCount: number; inputType: "brief" | "topic" | "top_pick" }
    | { status: "needs_profile"; missingFacts: MissingFactCode[] };
  message?: string;
};

type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

export function useCustomScriptJob({ enabled, initialResult }: { enabled: boolean; initialResult: CustomScriptResult }) {
  const [result, setResult] = useState<CustomScriptResult>(initialResult);
  const [jobId, setJobId] = useState<string | null>(null);
  const pendingRequestRef = useRef<PendingCustomScriptRequest | null>(null);
  const lastAcceptedRequestRef = useRef<AcceptedCustomScriptRequest | null>(null);
  const interactedRef = useRef(false);
  const pollingRef = useRef(false);

  const applySnapshot = useCallback((job: JobSnapshot | null) => {
    if (!job) return;
    if (job.status === "queued" || job.status === "processing") {
      setJobId(job.id);
      setResult({ status: "processing" });
      return;
    }
    setJobId(null);
    if (job.status === "succeeded" && job.result?.status === "success") {
      setResult({ status: "success", finalScript: job.result.finalScript });
    } else if (job.status === "needs_profile" && job.result?.status === "needs_profile") {
      setResult({ status: "needs_profile", missingFacts: job.result.missingFacts });
    } else if (job.status === "canceled") {
      setResult({ status: "canceled" });
    } else {
      setResult({ status: "failed", message: job.message || "生成失败，本次未扣额度，请稍后重试。" });
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void readEnvelope<JobSnapshot | null>("/api/scripts/generate-custom/current", { signal: controller.signal })
      .then((job) => {
        if (!interactedRef.current) applySnapshot(job);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [applySnapshot, enabled]);

  useEffect(() => {
    if (!enabled || !jobId) return;
    const controller = new AbortController();
    async function poll() {
      if (pollingRef.current || controller.signal.aborted) return;
      pollingRef.current = true;
      try {
        applySnapshot(await readEnvelope<JobSnapshot>(`/api/scripts/generate-custom/${jobId}`, {
          signal: controller.signal
        }));
      } catch {
        // A transient poll failure keeps the durable task resumable.
      } finally {
        pollingRef.current = false;
      }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 2_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [applySnapshot, enabled, jobId]);

  const postPendingRequest = useCallback(async (pending: PendingCustomScriptRequest) => {
    setResult({ status: "processing" });
    try {
      const snapshot = await readEnvelope<JobSnapshot>("/api/scripts/generate-custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customScriptRequestPayload(pending))
      });
      lastAcceptedRequestRef.current = acceptPendingCustomScriptRequest(pending);
      pendingRequestRef.current = null;
      applySnapshot(snapshot);
    } catch (error) {
      setResult({ status: "failed", message: error instanceof Error ? error.message : "任务提交失败，请使用相同条件重试。" });
    }
  }, [applySnapshot]);

  const submit = useCallback(async (
    draft: CustomScriptDraft,
    options?: { previousScript?: string }
  ) => {
    if (!enabled) return;
    interactedRef.current = true;
    const pending = createOrReusePendingCustomScriptRequest({
      pending: pendingRequestRef.current,
      draft,
      previousScript: options?.previousScript,
      createClientRequestId: () => crypto.randomUUID()
    });
    pendingRequestRef.current = pending;
    await postPendingRequest(pending);
  }, [enabled, postPendingRequest]);

  const cancel = useCallback(async () => {
    if (!jobId) return;
    interactedRef.current = true;
    try {
      applySnapshot(await readEnvelope<JobSnapshot>(`/api/scripts/generate-custom/${jobId}`, { method: "DELETE" }));
    } catch (error) {
      setResult({ status: "failed", message: error instanceof Error ? error.message : "取消失败，请稍后重试。" });
    }
  }, [applySnapshot, jobId]);

  const regenerate = useCallback(async (previousScript: string) => {
    const draft = lastAcceptedRequestRef.current?.draft;
    if (draft) await submit(draft, { previousScript });
  }, [submit]);

  const retryRegeneration = useCallback(async () => {
    if (!enabled) return;
    interactedRef.current = true;
    const retry = createExplicitRetryCustomScriptRequest({
      pending: pendingRequestRef.current,
      lastAcceptedRequest: lastAcceptedRequestRef.current,
      createClientRequestId: () => crypto.randomUUID()
    });
    if (!retry?.previousScript) return;
    pendingRequestRef.current = retry;
    await postPendingRequest(retry);
  }, [enabled, postPendingRequest]);

  const clear = useCallback(() => {
    interactedRef.current = true;
    pendingRequestRef.current = null;
    lastAcceptedRequestRef.current = null;
    setJobId(null);
    setResult({ status: "initial" });
  }, []);

  return {
    result,
    processing: result.status === "processing",
    canRegenerate: Boolean(lastAcceptedRequestRef.current),
    canRetryRegeneration: Boolean(
      pendingRequestRef.current?.previousScript || lastAcceptedRequestRef.current?.previousScript
    ),
    submit,
    cancel,
    regenerate,
    retryRegeneration,
    clear,
    setPreviewResult: setResult
  };
}

async function readEnvelope<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!payload || typeof payload !== "object" || !("success" in payload)) {
    throw new Error("服务响应异常，请稍后重试。");
  }
  if (!response.ok || !payload.success) {
    throw new Error(!payload.success && typeof payload.error?.message === "string"
      ? payload.error.message
      : "请求失败，请稍后重试。");
  }
  return payload.data;
}
