import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  STAGING_REPLACEMENT_PREFIX_IDS,
  getStagingReplacementPrefix,
  type StagingReplacementPrefixId
} from "../../lib/custom-scripts/staging-replacement-prefixes";
import {
  selectDeterministicReplacementSubset,
  type ReplacementChoiceDelta,
  type ReplacementSelection
} from "../../lib/custom-scripts/staging-replacement-probe-selection";
import {
  ReplacementProbeValidationError,
  finalizeStagingReplacementScript
} from "../../lib/custom-scripts/staging-replacement-probe-contract";

function fixedDelta(prefixId: (typeof STAGING_REPLACEMENT_PREFIX_IDS)[number]) {
  return [...getStagingReplacementPrefix(prefixId)].length;
}

function twoRoundsOfFixedCandidates(): ReplacementChoiceDelta[] {
  return Array.from({ length: 20 }, (_, index) => {
    const prefixId = STAGING_REPLACEMENT_PREFIX_IDS[index % STAGING_REPLACEMENT_PREFIX_IDS.length];
    return { index, prefixId, delta: fixedDelta(prefixId) };
  });
}

function selected(indexesAndIds: Array<[number, StagingReplacementPrefixId]>, finalLength = 290): ReplacementSelection {
  return {
    finalLength,
    selectedChoices: indexesAndIds.map(([index, prefixId]) => ({ index, prefixId }))
  };
}

function sentencesForTotal(total: number) {
  const contentTotal = total - 24;
  const base = Math.floor(contentTotal / 24);
  let remainder = contentTotal % 24;
  return Array.from({ length: 24 }, (_, index) => {
    const contentLength = base + (remainder-- > 0 ? 1 : 0);
    return `${String.fromCodePoint(0x4e00 + index)}${"真".repeat(contentLength - 1)}。`;
  });
}

test("24x3 unreachable base 200 returns during global reachability precheck", { timeout: 6_000 }, () => {
  const script = `
    import selectionModule from "./lib/custom-scripts/staging-replacement-probe-selection.ts";
    import prefixModule from "./lib/custom-scripts/staging-replacement-prefixes.ts";
    const ids = prefixModule.STAGING_REPLACEMENT_PREFIX_IDS;
    const candidates = Array.from({ length: 24 }, (_, index) => [0, 1, 2].map((offset) => {
      const prefixId = ids[(index * 3 + offset) % ids.length];
      return { index, prefixId, delta: [...prefixModule.getStagingReplacementPrefix(prefixId)].length };
    })).flat();
    const startedAt = performance.now();
    const result = selectionModule.selectDeterministicReplacementSubset(200, candidates);
    process.stdout.write(JSON.stringify({ result, selectionMs: performance.now() - startedAt }));
  `;
  const child = spawnSync(process.execPath, [
    "--require=./tests/server-only-shim.cjs",
    "--import", "tsx",
    "--eval", script
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 5_000
  });

  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
  const output = JSON.parse(child.stdout) as { result: unknown; selectionMs: number };
  assert.equal(output.result, null);
  assert.ok(output.selectionMs < 250, `selection took ${output.selectionMs}ms`);
});

test("selector ignores candidates whose delta differs from the fixed prefix mapping", () => {
  assert.equal(selectDeterministicReplacementSubset(285, [{
    index: 0,
    prefixId: "actually",
    delta: fixedDelta("put_plainly")
  }]), null);
});

test("base 208 and 220 terminate deterministically for reachable and unreachable inputs", { timeout: 5_000 }, () => {
  const candidates = twoRoundsOfFixedCandidates();
  assert.deepEqual(selectDeterministicReplacementSubset(208, candidates), selected(
    candidates.map(({ index, prefixId }) => [index, prefixId]),
    280
  ));
  assert.equal(selectDeterministicReplacementSubset(208, candidates.slice(0, 19)), null);

  assert.deepEqual(selectDeterministicReplacementSubset(220, candidates), selected([
    [0, "actually"], [1, "contrast"], [2, "therefore"], [3, "another_angle"],
    [4, "at_this_point"], [5, "back_to_scene"], [6, "think_again"], [7, "in_other_words"],
    [8, "more_important"], [9, "put_plainly"], [10, "actually"], [11, "contrast"],
    [13, "another_angle"], [14, "at_this_point"], [15, "back_to_scene"], [16, "think_again"],
    [17, "in_other_words"], [18, "more_important"], [19, "put_plainly"]
  ]));
  assert.equal(selectDeterministicReplacementSubset(220, candidates.slice(0, 10)), null);
});

test("tiny injected budget returns selection_budget without a partial selection", () => {
  const result = selectDeterministicReplacementSubset(220, twoRoundsOfFixedCandidates(), {
    maxUniqueStates: 1,
    maxTransitions: 1
  });
  assert.deepEqual(result, { reason: "selection_budget" });
  assert.equal("selectedChoices" in result, false);
});

test("finalizer preserves selection_budget as an allowlisted validation failure", () => {
  assert.throws(() => finalizeStagingReplacementScript({
    originalSentences: sentencesForTotal(220),
    candidates: twoRoundsOfFixedCandidates(),
    context: {
      objective: "trust",
      requestText: "写一条适合附近上班族的下午茶口播",
      merchantProjectName: "小岛西点烘焙",
      merchantProfileText: "主营甜品和下午茶，服务附近上班族。"
    },
    selectionBudget: { maxUniqueStates: 1, maxTransitions: 1 }
  }), (error: unknown) =>
    error instanceof ReplacementProbeValidationError && error.reason === "selection_budget");
});

test("base 240 and 264 preserve deterministic PR63 answers across ordering and duplicates", { timeout: 5_000 }, () => {
  const candidates = twoRoundsOfFixedCandidates();
  const expected240 = selected([
    [0, "actually"], [3, "another_angle"], [4, "at_this_point"], [5, "back_to_scene"],
    [6, "think_again"], [7, "in_other_words"], [8, "more_important"], [9, "put_plainly"],
    [13, "another_angle"], [14, "at_this_point"], [18, "more_important"], [19, "put_plainly"]
  ]);
  const expected264 = selected([
    [0, "actually"], [3, "another_angle"], [8, "more_important"], [9, "put_plainly"],
    [18, "more_important"], [19, "put_plainly"]
  ]);
  const noisy = candidates.toReversed().flatMap((candidate) => [candidate, { ...candidate }]);

  for (let run = 0; run < 5; run += 1) {
    assert.deepEqual(selectDeterministicReplacementSubset(240, noisy), expected240);
    assert.deepEqual(selectDeterministicReplacementSubset(264, noisy), expected264);
  }
});
