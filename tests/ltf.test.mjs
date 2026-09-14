import assert from "node:assert/strict";
import test from "node:test";
import { buildMarkdownDocument, normalizeTags, safeFilename } from "../extension/src/ltf.js";

function captureWith(turns, quality = {}, platform = "chatgpt") {
  return {
    title: "研究：測試 / 對話",
    capturedAt: "2026-08-25T01:02:03.000Z",
    strategy: "chatgpt-full-viewport-sweep",
    platform,
    turns,
    quality: {
      complete: true,
      scrollComplete: true,
      turnCount: turns.length,
      humanCount: turns.filter((turn) => turn.role === "human").length,
      aiCount: turns.filter((turn) => turn.role === "ai").length,
      missingTurnNumbers: [],
      warnings: [],
      ...quality,
    },
  };
}

test("serializes plain Markdown and preserves turn order", () => {
  const capture = captureWith([
    { role: "human", content: "請解釋 `x`。", turnNumber: 0 },
    { role: "ai", content: "答案：\n\n```js\nconst x = 1;\n```", turnNumber: 1 },
  ]);
  const result = buildMarkdownDocument({
    metadata: {
      title: '研究："測試" / 對話',
      language: "zh-TW",
      tags: "research, chatgpt, research",
      created: "2026-08-25T01:02:03.000Z",
    },
    capture,
  });

  assert.match(result.content, /^# 研究："測試" \/ 對話/);
  assert.match(result.content, /> Source: ChatGPT · Exported: 2026-08-25T01:02:03\.000Z/);
  assert.match(result.content, /> Language: zh-TW · Turns: 2 \(Human 1, AI 1\)/);
  assert.match(result.content, /> Tags: research, chatgpt/);
  assert.doesNotMatch(result.content, /localthink|x_capture|visibility/i);
  assert.ok(result.content.indexOf("### Human") < result.content.indexOf("### AI"));
  assert.match(result.content, /```js\nconst x = 1;\n```/);
  assert.equal(result.filename, '研究--測試- - 對話.md');
});

test("marks a warned capture as incomplete", () => {
  const capture = captureWith(
    [
      { role: "human", content: "第一題", turnNumber: 0 },
      { role: "ai", content: "第一答", turnNumber: 2 },
    ],
    {
      complete: false,
      scrollComplete: false,
      missingTurnNumbers: [1],
      warnings: ["可能缺少回合：1"],
    },
  );
  const result = buildMarkdownDocument({ metadata: {}, capture });
  assert.match(result.content, /\*\*Capture warning:\*\*/);
  assert.match(result.content, /> - 可能缺少回合：1/);
  assert.match(result.content, /Compare it with the original ChatGPT page/);
});

test("labels Claude and Gemini exports without changing the Markdown format", () => {
  for (const [platform, label] of [["claude", "Claude"], ["gemini", "Gemini"]]) {
    const capture = captureWith([
      { role: "human", content: "Hello" },
      { role: "ai", content: "Hi" },
    ], {}, platform);
    capture.title = `${label} note`;
    const result = buildMarkdownDocument({ metadata: { language: "en" }, capture });
    assert.match(result.content, new RegExp(`^# ${label} note`));
    assert.match(result.content, new RegExp(`> Source: ${label} · Exported:`));
  }
});

test("labels Grok exports without changing the Markdown format", () => {
  const capture = captureWith([
    { role: "human", content: "Compare two options.", messageId: "response-user" },
    { role: "ai", content: "| Option | Result |\n| --- | --- |\n| A | Good |", messageId: "response-ai" },
  ], {}, "grok");
  capture.title = "Grok comparison";

  const result = buildMarkdownDocument({ metadata: { language: "en" }, capture });
  assert.match(result.content, /^# Grok comparison/);
  assert.match(result.content, /> Source: Grok · Exported:/);
  assert.match(result.content, /### Human[\s\S]+### AI/);
  assert.equal(result.filename, "Grok comparison.md");
});

test("serializes a long 360-turn capture without truncation", () => {
  const turns = Array.from({ length: 360 }, (_, index) => ({
    role: index % 2 === 0 ? "human" : "ai",
    content: `回合 ${index}\n\n${index % 11 === 0 ? "- item A\n- item B" : "內容"}`,
    turnNumber: index,
  }));
  const result = buildMarkdownDocument({ metadata: { title: "長對話" }, capture: captureWith(turns) });
  assert.match(result.content, /Turns: 360 \(Human 180, AI 180\)/);
  assert.match(result.content, /回合 359/);
  assert.equal((result.content.match(/^### (Human|AI)$/gm) || []).length, 360);
});

test("helpers normalize filenames and tags", () => {
  assert.equal(safeFilename('  a<b>:c/  '), "a-b--c-");
  assert.deepEqual(normalizeTags(" one, two, one, ,three "), ["one", "two", "three"]);
});

test("rejects an empty capture", () => {
  assert.throws(
    () => buildMarkdownDocument({ metadata: {}, capture: { turns: [] } }),
    /沒有可匯出的對話回合/,
  );
});
