export type ProviderPrices = {
  deepseekInputCnyPerMillion: number;
  deepseekOutputCnyPerMillion: number;
  asrCnyPerHour: number;
  tikhubCnyPerRequest: number;
};

export function getShanghaiUsageDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`);
}

export function calculateEstimatedCostMicros({
  deepseekInputTokens = 0,
  deepseekOutputTokens = 0,
  asrAudioSeconds = 0,
  tikhubRequests = 0,
  prices
}: {
  deepseekInputTokens?: number;
  deepseekOutputTokens?: number;
  asrAudioSeconds?: number;
  tikhubRequests?: number;
  prices: ProviderPrices;
}) {
  const cny =
    (deepseekInputTokens / 1_000_000) * prices.deepseekInputCnyPerMillion +
    (deepseekOutputTokens / 1_000_000) * prices.deepseekOutputCnyPerMillion +
    (asrAudioSeconds / 3600) * prices.asrCnyPerHour +
    tikhubRequests * prices.tikhubCnyPerRequest;

  return Math.max(0, Math.round(cny * 1_000_000));
}

export function hasReachedDailyScriptLimit({
  scriptsGenerated,
  limit
}: {
  scriptsGenerated: number;
  limit: number;
}) {
  return scriptsGenerated >= limit;
}

export function hasReachedDailyTopicLimit({
  topicIdeasGenerated,
  limit
}: {
  topicIdeasGenerated: number;
  limit: number;
}) {
  return topicIdeasGenerated >= limit;
}

export function getProviderPrices(
  env: Record<string, string | undefined> = process.env
): ProviderPrices {
  return {
    deepseekInputCnyPerMillion: getNonNegativeNumber(
      env.COST_DEEPSEEK_INPUT_CNY_PER_MILLION,
      0
    ),
    deepseekOutputCnyPerMillion: getNonNegativeNumber(
      env.COST_DEEPSEEK_OUTPUT_CNY_PER_MILLION,
      0
    ),
    asrCnyPerHour: getNonNegativeNumber(env.COST_ASR_CNY_PER_HOUR, 0),
    tikhubCnyPerRequest: getNonNegativeNumber(
      env.COST_TIKHUB_CNY_PER_REQUEST,
      0
    )
  };
}

function getNonNegativeNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
