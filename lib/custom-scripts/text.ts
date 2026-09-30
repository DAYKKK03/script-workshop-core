const unicodeWhiteSpacePattern = /\p{White_Space}/gu;
const customScriptBoundaryPattern = /^[\p{White_Space}\uFEFF]+|[\p{White_Space}\uFEFF]+$/gu;

/**
 * Applies the canonical text preparation shared by browser and server code.
 * FEFF is explicit because ECMAScript trim treats it as a boundary character,
 * while Unicode's White_Space property intentionally does not include it.
 */
export function normalizeCustomScriptText(value: string) {
  return normalizeCustomScriptLineEndings(value).replace(customScriptBoundaryPattern, "");
}

/** Keeps boundaries intact for parsers that must inspect leading blank lines. */
export function normalizeCustomScriptLineEndings(value: string) {
  return value.normalize("NFC").replace(/\r\n?/g, "\n");
}

/** Counts normalized input, including internal line breaks and whitespace. */
export function countNormalizedCustomScriptCodePoints(value: string) {
  return Array.from(normalizeCustomScriptText(value)).length;
}

/**
 * Counts output after removing Unicode White_Space. Interior FEFF is retained
 * and counted so an invisible BOM cannot be used to bypass length validation.
 */
export function countCustomScriptCodePoints(value: string) {
  return Array.from(normalizeCustomScriptText(value).replace(unicodeWhiteSpacePattern, "")).length;
}

/** Counts only non-empty speech lines after canonical text normalization. */
export function countCustomScriptNonEmptyLines(value: string) {
  return normalizeCustomScriptText(value)
    .split("\n")
    .filter((line) => !isCustomScriptWhitespaceOnly(line)).length;
}

export function isCustomScriptWhitespaceOnly(value: string) {
  return normalizeCustomScriptText(value).length === 0;
}
