import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readProjectFile(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("core navigation exposes all four content destinations without unfinished entries", async () => {
  const shell = await readProjectFile("components/app-shell.tsx");

  assert.doesNotMatch(shell, /label: "工作台"/);
  assert.match(shell, /href: "\/projects", label: "商家项目"/);
  assert.match(shell, /href: "\/generate", label: "脚本生成"/);
  assert.match(shell, /href: "\/topics", label: "爆款选题"/);
  assert.match(shell, /href: "\/custom-scripts", label: "定制化脚本"/);
  assert.ok(shell.indexOf('href: "/topics"') < shell.indexOf('href: "/custom-scripts"'));
  assert.doesNotMatch(shell, /AI 数字人|placeholderItems|该功能正在开发中/);
});

test("legacy dashboard route redirects to script generation", async () => {
  const dashboard = await readProjectFile("app/dashboard/page.tsx");

  assert.match(dashboard, /redirect\("\/generate"\)/);
});
