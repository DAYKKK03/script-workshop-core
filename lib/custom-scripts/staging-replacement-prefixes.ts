/**
 * The only text that the staging replacement probe may add to a model sentence.
 * IDs are intentionally stable because the model returns IDs, never free text.
 */
export const PREFIX_ID_TO_TEXT = Object.freeze({
  actually: "其实",
  contrast: "不过",
  therefore: "所以",
  another_angle: "换个角度",
  at_this_point: "说到这里",
  back_to_scene: "回到眼前",
  think_again: "仔细想想",
  in_other_words: "换句话说",
  more_important: "更关键的是",
  put_plainly: "说得直接些"
} as const);

export type StagingReplacementPrefixId = keyof typeof PREFIX_ID_TO_TEXT;

export const STAGING_REPLACEMENT_PREFIX_IDS = Object.freeze(
  Object.keys(PREFIX_ID_TO_TEXT) as StagingReplacementPrefixId[]
);

const prefixIdRank = new Map(
  STAGING_REPLACEMENT_PREFIX_IDS.map((prefixId, index) => [prefixId, index])
);

export function isStagingReplacementPrefixId(value: unknown): value is StagingReplacementPrefixId {
  return typeof value === "string" && Object.hasOwn(PREFIX_ID_TO_TEXT, value);
}

export function getStagingReplacementPrefix(prefixId: StagingReplacementPrefixId) {
  return PREFIX_ID_TO_TEXT[prefixId];
}

export function compareStagingReplacementPrefixIds(
  left: StagingReplacementPrefixId,
  right: StagingReplacementPrefixId
) {
  return (prefixIdRank.get(left) ?? Number.MAX_SAFE_INTEGER) -
    (prefixIdRank.get(right) ?? Number.MAX_SAFE_INTEGER);
}

export function stagingReplacementPrefixIdRank(prefixId: StagingReplacementPrefixId) {
  return prefixIdRank.get(prefixId) ?? Number.MAX_SAFE_INTEGER;
}
