const sentenceEndCharacters = new Set(["。", "！", "？", ".", "!", "?"]);
const closingCharacters = new Set(["”", "’", '"', "'", "）", ")", "】", "]", "》", "」", "』"]);

export function formatFinalScript(value: string) {
  const paragraphs = collectParagraphs(value);

  return paragraphs
    .map((paragraph) => splitSentences(joinSoftLines(paragraph)).join("\n"))
    .filter(Boolean)
    .join("\n\n");
}

function collectParagraphs(value: string) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const paragraphs: string[][] = [];
  let currentParagraph: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line) {
      currentParagraph.push(line);
      continue;
    }

    if (currentParagraph.length > 0) {
      paragraphs.push(currentParagraph);
      currentParagraph = [];
    }
  }

  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph);
  }

  return paragraphs;
}

function joinSoftLines(lines: string[]) {
  return lines.reduce((joined, line) => {
    if (!joined) {
      return line;
    }

    const needsSpace = /[A-Za-z0-9]$/.test(joined) && /^[A-Za-z0-9]/.test(line);
    return `${joined}${needsSpace ? " " : ""}${line}`;
  }, "");
}

function splitSentences(value: string) {
  const sentences: string[] = [];
  let sentence = "";

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    sentence += character;

    if (!isSentenceEnd(value, index)) {
      continue;
    }

    while (
      index + 1 < value.length &&
      (sentenceEndCharacters.has(value[index + 1]) ||
        closingCharacters.has(value[index + 1]))
    ) {
      index += 1;
      sentence += value[index];
    }

    const normalizedSentence = sentence.trim();

    if (normalizedSentence) {
      sentences.push(normalizedSentence);
    }

    sentence = "";
  }

  const remainder = sentence.trim();

  if (remainder) {
    sentences.push(remainder);
  }

  return sentences;
}

function isSentenceEnd(value: string, index: number) {
  const character = value[index];

  if (!sentenceEndCharacters.has(character)) {
    return false;
  }

  if (
    character === "." &&
    /\d/.test(value[index - 1] || "") &&
    /\d/.test(value[index + 1] || "")
  ) {
    return false;
  }

  return true;
}
