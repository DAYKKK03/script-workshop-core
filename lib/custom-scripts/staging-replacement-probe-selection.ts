import {
  PREFIX_ID_TO_TEXT,
  STAGING_REPLACEMENT_PREFIX_IDS,
  compareStagingReplacementPrefixIds,
  stagingReplacementPrefixIdRank,
  type StagingReplacementPrefixId
} from "@/lib/custom-scripts/staging-replacement-prefixes";

export type ReplacementChoiceDelta = {
  index: number;
  prefixId: StagingReplacementPrefixId;
  delta: number;
};
export type SelectedReplacementChoice = {
  index: number;
  prefixId: StagingReplacementPrefixId;
};
export type ReplacementSelection = {
  finalLength: number;
  selectedChoices: SelectedReplacementChoice[];
};
export type ReplacementSelectionBudget = {
  maxUniqueStates: number;
  maxTransitions: number;
};
export type ReplacementSelectionBudgetExceeded = { reason: "selection_budget" };
export type ReplacementSelectionResult =
  | ReplacementSelection
  | ReplacementSelectionBudgetExceeded
  | null;

const sentenceCount = 24;
const maximumUsesPerId = 2;
export const DEFAULT_REPLACEMENT_SELECTION_BUDGET = Object.freeze({
  maxUniqueStates: 250_000,
  maxTransitions: 1_000_000
} satisfies ReplacementSelectionBudget);
const selectionBudgetExceeded = Object.freeze({ reason: "selection_budget" } as const);
const finalLengthsByPreference = Array.from({ length: 21 }, (_, offset) => 280 + offset)
  .sort((left, right) => Math.abs(left - 290) - Math.abs(right - 290) || left - right);
const fixedPrefixLengths = Object.values(PREFIX_ID_TO_TEXT).map((prefix) => [...prefix].length);
const minimumPrefixLength = Math.min(...fixedPrefixLengths);
const maximumPrefixLength = Math.max(...fixedPrefixLengths);
const ternaryPowers = STAGING_REPLACEMENT_PREFIX_IDS.map((_, index) => 3 ** index);

/**
 * Finds the first valid solution in exact business-preference order. A bounded
 * DFS avoids materializing every subset while keeping deterministic results.
 */
export function selectDeterministicReplacementSubset(
  baseLength: number,
  candidates: ReplacementChoiceDelta[],
  requestedBudget: Partial<ReplacementSelectionBudget> = {}
): ReplacementSelectionResult {
  if (!Number.isInteger(baseLength) || baseLength < 0 || baseLength > 300) return null;
  const prepared = canonicalizeCandidates(candidates);
  if (prepared.maximumDelta < Math.max(1, 280 - baseLength)) return null;
  const tracker = createBudgetTracker(requestedBudget);

  for (const finalLength of finalLengthsByPreference) {
    const targetDelta = finalLength - baseLength;
    if (targetDelta <= 0 || targetDelta > prepared.maximumDelta) continue;
    for (let choiceCount = 1; choiceCount <= prepared.maximumChoices; choiceCount += 1) {
      const globalBounds = prepared.suffixes[0];
      if (
        globalBounds.minimumDeltaByChoiceCount[choiceCount] > targetDelta ||
        globalBounds.maximumDeltaByChoiceCount[choiceCount] < targetDelta
      ) continue;
      const selectedChoices = findStableChoiceSet(
        prepared.byIndex,
        prepared.suffixes,
        targetDelta,
        choiceCount,
        tracker
      );
      if (tracker.exhausted) return selectionBudgetExceeded;
      if (selectedChoices) return { finalLength, selectedChoices };
    }
  }
  return null;
}

export function isReplacementSelectionBudgetExceeded(
  value: ReplacementSelectionResult
): value is ReplacementSelectionBudgetExceeded {
  return Boolean(value && "reason" in value && value.reason === "selection_budget");
}

function canonicalizeCandidates(candidates: ReplacementChoiceDelta[]) {
  const byIndex = Array.from({ length: sentenceCount }, () => [] as ReplacementChoiceDelta[]);
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (
      !Number.isInteger(candidate.index) || candidate.index < 0 || candidate.index >= sentenceCount ||
      !Number.isInteger(candidate.delta) || candidate.delta <= 0 ||
      !STAGING_REPLACEMENT_PREFIX_IDS.includes(candidate.prefixId)
    ) continue;
    const rank = stagingReplacementPrefixIdRank(candidate.prefixId);
    if (candidate.delta !== fixedPrefixLengths[rank]) continue;
    const key = `${candidate.index}:${candidate.prefixId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    byIndex[candidate.index].push(candidate);
  }
  for (const choices of byIndex) {
    choices.sort((left, right) => compareStagingReplacementPrefixIds(left.prefixId, right.prefixId));
  }
  const indexAvailabilityById = Array.from(
    { length: STAGING_REPLACEMENT_PREFIX_IDS.length },
    () => 0
  );
  let availableIndexes = 0;
  for (const choices of byIndex) {
    if (choices.length > 0) availableIndexes += 1;
    for (const choice of choices) {
      indexAvailabilityById[stagingReplacementPrefixIdRank(choice.prefixId)] += 1;
    }
  }
  const capacities = indexAvailabilityById.map((count) => Math.min(2, count));
  const maximumChoices = Math.min(
    availableIndexes,
    capacities.reduce((sum, count) => sum + count, 0)
  );
  const suffixes = buildSuffixReachability(byIndex);
  return {
    byIndex,
    suffixes,
    maximumChoices,
    maximumDelta: suffixes[0].maximumDeltaByChoiceCount[maximumChoices] ?? 0
  };
}

type SuffixReachability = {
  availableIndexes: number;
  idAvailability: number[];
  minimumDeltaByChoiceCount: number[];
  maximumDeltaByChoiceCount: number[];
};

function buildSuffixReachability(byIndex: ReplacementChoiceDelta[][]): SuffixReachability[] {
  const suffixes = Array.from({ length: sentenceCount + 1 }, () => emptySuffixReachability());
  for (let index = sentenceCount - 1; index >= 0; index -= 1) {
    const next = suffixes[index + 1];
    const idAvailability = [...next.idAvailability];
    for (const choice of byIndex[index]) {
      idAvailability[stagingReplacementPrefixIdRank(choice.prefixId)] += 1;
    }
    const availableIndexes = next.availableIndexes + (byIndex[index].length > 0 ? 1 : 0);
    suffixes[index] = buildReachabilityBounds(availableIndexes, idAvailability);
  }
  return suffixes;
}

function emptySuffixReachability(): SuffixReachability {
  return {
    availableIndexes: 0,
    idAvailability: Array.from({ length: STAGING_REPLACEMENT_PREFIX_IDS.length }, () => 0),
    minimumDeltaByChoiceCount: [0],
    maximumDeltaByChoiceCount: [0]
  };
}

function buildReachabilityBounds(
  availableIndexes: number,
  idAvailability: number[]
): SuffixReachability {
  const deltas = idAvailability.flatMap((availability, rank) =>
    Array.from(
      { length: Math.min(maximumUsesPerId, availability) },
      () => fixedPrefixLengths[rank]
    )
  );
  const maximumChoices = Math.min(availableIndexes, deltas.length);
  const ascending = deltas.toSorted((left, right) => left - right).slice(0, maximumChoices);
  const descending = deltas.toSorted((left, right) => right - left).slice(0, maximumChoices);
  return {
    availableIndexes,
    idAvailability,
    minimumDeltaByChoiceCount: cumulativeSums(ascending),
    maximumDeltaByChoiceCount: cumulativeSums(descending)
  };
}

function cumulativeSums(values: number[]) {
  const sums = [0];
  for (const value of values) sums.push(sums.at(-1)! + value);
  return sums;
}

function findStableChoiceSet(
  byIndex: ReplacementChoiceDelta[][],
  suffixes: SuffixReachability[],
  targetDelta: number,
  targetChoiceCount: number,
  tracker: SelectionBudgetTracker
): SelectedReplacementChoice[] | null {
  if (
    targetDelta < targetChoiceCount * minimumPrefixLength ||
    targetDelta > targetChoiceCount * maximumPrefixLength
  ) return null;

  const counts = Array.from({ length: STAGING_REPLACEMENT_PREFIX_IDS.length }, () => 0);
  const selected: SelectedReplacementChoice[] = [];
  const failedStates = new Set<string>();

  function visit(
    index: number,
    remainingDelta: number,
    remainingChoices: number,
    lastPrefixId: StagingReplacementPrefixId | null,
    countCode: number
  ): boolean {
    if (tracker.exhausted) return false;
    const stateKey = `${targetChoiceCount > 2 ? 1 : 0}|${index}|${remainingDelta}|${remainingChoices}|${lastPrefixId ?? "-"}|${countCode}`;
    if (failedStates.has(stateKey)) return false;
    if (!consumeUniqueState(tracker, stateKey)) return false;
    if (remainingChoices === 0) {
      const distinctIds = counts.filter((count) => count > 0).length;
      return remainingDelta === 0 && (targetChoiceCount <= 2 || distinctIds >= 2);
    }
    const suffix = suffixes[index] ?? suffixes[sentenceCount];
    const dynamicBounds = remainingDeltaBounds(suffix, counts, remainingChoices);
    if (
      index >= sentenceCount || remainingChoices > sentenceCount - index || remainingDelta <= 0 ||
      remainingChoices > suffix.availableIndexes || !dynamicBounds ||
      remainingDelta < remainingChoices * minimumPrefixLength ||
      remainingDelta > remainingChoices * maximumPrefixLength ||
      remainingDelta < dynamicBounds.minimumDelta ||
      remainingDelta > dynamicBounds.maximumDelta
    ) return false;

    // Trying the current index before skipping makes the first solution the
    // lexicographically smallest index/ID sequence for this length and count.
    for (const choice of byIndex[index]) {
      const rank = stagingReplacementPrefixIdRank(choice.prefixId);
      if (counts[rank] >= maximumUsesPerId || choice.prefixId === lastPrefixId || choice.delta > remainingDelta) continue;
      if (!consumeTransition(tracker)) return false;
      counts[rank] += 1;
      selected.push({ index, prefixId: choice.prefixId });
      if (visit(
        index + 1,
        remainingDelta - choice.delta,
        remainingChoices - 1,
        choice.prefixId,
        countCode + ternaryPowers[rank]
      )) return true;
      selected.pop();
      counts[rank] -= 1;
      if (tracker.exhausted) return false;
    }
    if (!consumeTransition(tracker)) return false;
    if (visit(index + 1, remainingDelta, remainingChoices, lastPrefixId, countCode)) return true;
    if (tracker.exhausted) return false;

    failedStates.add(stateKey);
    return false;
  }

  return visit(0, targetDelta, targetChoiceCount, null, 0) ? [...selected] : null;
}

function remainingDeltaBounds(
  suffix: SuffixReachability,
  counts: number[],
  remainingChoices: number
) {
  const deltas = suffix.idAvailability.flatMap((availability, rank) =>
    Array.from(
      { length: Math.min(maximumUsesPerId - counts[rank], availability) },
      () => fixedPrefixLengths[rank]
    )
  );
  if (remainingChoices > deltas.length) return null;
  const ascending = deltas.toSorted((left, right) => left - right);
  const descending = deltas.toSorted((left, right) => right - left);
  return {
    minimumDelta: ascending.slice(0, remainingChoices).reduce((sum, delta) => sum + delta, 0),
    maximumDelta: descending.slice(0, remainingChoices).reduce((sum, delta) => sum + delta, 0)
  };
}

type SelectionBudgetTracker = ReplacementSelectionBudget & {
  uniqueStates: number;
  transitions: number;
  exhausted: boolean;
  observedStates: Set<string>;
};

function createBudgetTracker(requested: Partial<ReplacementSelectionBudget>): SelectionBudgetTracker {
  return {
    maxUniqueStates: boundedBudgetValue(requested.maxUniqueStates, DEFAULT_REPLACEMENT_SELECTION_BUDGET.maxUniqueStates),
    maxTransitions: boundedBudgetValue(requested.maxTransitions, DEFAULT_REPLACEMENT_SELECTION_BUDGET.maxTransitions),
    uniqueStates: 0,
    transitions: 0,
    exhausted: false,
    observedStates: new Set<string>()
  };
}

function boundedBudgetValue(value: number | undefined, hardLimit: number) {
  return Number.isInteger(value) && value !== undefined && value >= 0
    ? Math.min(value, hardLimit)
    : hardLimit;
}

function consumeUniqueState(tracker: SelectionBudgetTracker, stateKey: string) {
  if (tracker.observedStates.has(stateKey)) return true;
  tracker.observedStates.add(stateKey);
  tracker.uniqueStates += 1;
  tracker.exhausted ||= tracker.uniqueStates > tracker.maxUniqueStates;
  return !tracker.exhausted;
}

function consumeTransition(tracker: SelectionBudgetTracker) {
  tracker.transitions += 1;
  tracker.exhausted ||= tracker.transitions > tracker.maxTransitions;
  return !tracker.exhausted;
}
