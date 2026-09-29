import assert from "node:assert/strict";
import test from "node:test";
import {
  formatTopPickForCopy,
  formatTopicForCopy,
  sanitizeTopicCopyProjectName
} from "../../components/topics/topic-copy";
import type { TopicIdea, TopPick } from "../../components/topics/topic-types";

const idea: TopicIdea = {
  keywordIndex: 0,
  audienceSceneIndex: 0,
  keyword: "下午茶",
  audienceScene: "附近上班族",
  title: "下午茶怎么选",
  opening: "先看当天安排。",
  hook: "别只看外表。",
  viralElements: ["人群", "反差"],
  viralElementReason: "用具体人群制造选择反差。"
};
const project = { id: "project-a", projectName: "  小岛\r\n西点\u2028烘焙  " };

test("ordinary topic copy starts with the exact five-line project source header", () => {
  const copied = formatTopicForCopy(idea, project);
  const lines = copied.split("\n");
  assert.deepEqual(lines.slice(0, 5), [
    "【脚本工坊爆款选题】",
    "sourceProjectId: project-a",
    "sourceType: topic",
    "sourceObjective: auto",
    "商家项目：小岛 西点 烘焙"
  ]);
  assert.equal(lines[5], "选题标题：下午茶怎么选");
});

test("Top 3 copy inherits its objective and keeps all execution details", () => {
  const pick: TopPick = {
    objective: "conversion",
    keywordIndex: 0,
    audienceSceneIndex: 0,
    reason: "更接近消费决策。",
    shootingDifficulty: "low",
    requiredMaterials: ["产品近景"],
    suggestedScene: "店内桌边",
    riskNote: "不要虚构活动。"
  };
  const copied = formatTopPickForCopy(idea, pick, project);
  assert.match(copied, /^【脚本工坊爆款选题】\nsourceProjectId: project-a\nsourceType: top_pick\nsourceObjective: conversion\n商家项目：小岛 西点 烘焙\n转化优先\n/);
  for (const detail of ["推荐理由：更接近消费决策。", "拍摄难度：低", "准备素材：产品近景", "拍摄场景：店内桌边", "风险提醒：不要虚构活动。"]) {
    assert.match(copied, new RegExp(detail));
  }
});

test("project display names cannot create extra source-header lines", () => {
  assert.equal(sanitizeTopicCopyProjectName(" A\n\rB\u2028C\u2029  D "), "A B C D");
});
