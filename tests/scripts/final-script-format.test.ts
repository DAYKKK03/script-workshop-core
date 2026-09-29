import assert from "node:assert/strict";
import test from "node:test";

async function loadFormatter() {
  const formatterModule = await import(
    "../../lib/scripts/format-final-script.ts"
  ).catch(() => ({ formatFinalScript: undefined }));

  assert.equal(typeof formatterModule.formatFinalScript, "function");
  return formatterModule.formatFinalScript!;
}

test("places each Chinese sentence on its own line", async () => {
  const formatFinalScript = await loadFormatter();

  assert.equal(
    formatFinalScript("第一句。第二句！第三句？"),
    "第一句。\n第二句！\n第三句？"
  );
});

test("places English sentences on separate lines and keeps closing quotes", async () => {
  const formatFinalScript = await loadFormatter();

  assert.equal(
    formatFinalScript('First sentence. "Second question?" Third!'),
    'First sentence.\n"Second question?"\nThird!'
  );
});

test("does not split at commas or decimal points", async () => {
  const formatFinalScript = await loadFormatter();

  assert.equal(
    formatFinalScript("先介绍菜品，再说明环境，套餐价格是9.9元。最后邀请到店！"),
    "先介绍菜品，再说明环境，套餐价格是9.9元。\n最后邀请到店！"
  );
});

test("preserves paragraphs as one blank line and normalizes existing line breaks", async () => {
  const formatFinalScript = await loadFormatter();

  assert.equal(
    formatFinalScript(
      "  第一段第一句。\r\n第一段第二句！  \r\n\r\n\r\n  第二段第一句？ 第二段第二句。  "
    ),
    "第一段第一句。\n第一段第二句！\n\n第二段第一句？\n第二段第二句。"
  );
});

test("joins soft line breaks without changing Chinese or English words", async () => {
  const formatFinalScript = await loadFormatter();

  assert.equal(
    formatFinalScript("这是一个\n完整句子。\nHello\nworld!"),
    "这是一个完整句子。\nHello world!"
  );
});

test("returns an empty string for empty or whitespace-only content", async () => {
  const formatFinalScript = await loadFormatter();

  assert.equal(formatFinalScript(" \n\r\n  "), "");
});
