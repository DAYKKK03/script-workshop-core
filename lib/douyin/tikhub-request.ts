import { summarizeDiagnosticString } from "./diagnostics";

export type TikHubRequestErrorCode =
  | "TIKHUB_PROVIDER_AUTH_FAILED"
  | "TIKHUB_PROVIDER_TRANSIENT_FAILED"
  | "TIKHUB_PROVIDER_REQUEST_FAILED";

export type TikHubRequestResult =
  | {
      status: "success";
      response: Response;
      attempts: number;
    }
  | {
      status: "failed";
      errorCode: TikHubRequestErrorCode;
      attempts: number;
      retryable: boolean;
      httpStatus?: number;
      failureCategory: "auth" | "request" | "transient";
      responseBodyLength?: number;
      responseBodyHash8?: string;
    };

export async function requestTikHubWithRetry({
  request,
  maxRetries = 1,
  retryDelayMs = 500
}: {
  request: () => Promise<Response>;
  maxRetries?: number;
  retryDelayMs?: number;
}): Promise<TikHubRequestResult> {
  const totalAttempts = Math.max(1, maxRetries + 1);

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      const response = await request();

      if (response.ok) {
        return {
          status: "success",
          response,
          attempts: attempt
        };
      }

      const errorCode = classifyHttpStatus(response.status);
      const responseText = await response.text().catch(() => "");
      const responseSummary = summarizeDiagnosticString(responseText);

      if (
        errorCode === "TIKHUB_PROVIDER_TRANSIENT_FAILED" &&
        attempt < totalAttempts
      ) {
        await wait(retryDelayMs);
        continue;
      }

      return {
        status: "failed",
        errorCode,
        attempts: attempt,
        retryable: isRetryableTikHubErrorCode(errorCode),
        httpStatus: response.status,
        failureCategory: getFailureCategory(errorCode),
        responseBodyLength: responseSummary?.length,
        responseBodyHash8: responseSummary?.hash8
      };
    } catch {
      if (attempt < totalAttempts) {
        await wait(retryDelayMs);
        continue;
      }

      return {
        status: "failed",
        errorCode: "TIKHUB_PROVIDER_TRANSIENT_FAILED",
        attempts: attempt,
        retryable: true,
        failureCategory: "transient"
      };
    }
  }

  return {
    status: "failed",
    errorCode: "TIKHUB_PROVIDER_REQUEST_FAILED",
    attempts: totalAttempts,
    retryable: false,
    failureCategory: "request"
  };
}

function classifyHttpStatus(status: number): TikHubRequestErrorCode {
  if (status === 401 || status === 403) {
    return "TIKHUB_PROVIDER_AUTH_FAILED";
  }

  if (status === 429 || status >= 500) {
    return "TIKHUB_PROVIDER_TRANSIENT_FAILED";
  }

  return "TIKHUB_PROVIDER_REQUEST_FAILED";
}

function isRetryableTikHubErrorCode(errorCode: TikHubRequestErrorCode) {
  return errorCode === "TIKHUB_PROVIDER_TRANSIENT_FAILED";
}

function getFailureCategory(errorCode: TikHubRequestErrorCode) {
  if (errorCode === "TIKHUB_PROVIDER_AUTH_FAILED") {
    return "auth" as const;
  }

  if (errorCode === "TIKHUB_PROVIDER_TRANSIENT_FAILED") {
    return "transient" as const;
  }

  return "request" as const;
}

function wait(ms: number) {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
}
