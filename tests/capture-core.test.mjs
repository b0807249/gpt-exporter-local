import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(projectRoot, "extension", "src", "capture-core.js"), "utf8");
const context = vm.createContext({});
vm.runInContext(source, context);
const core = context.GptExporterCaptureCore;

function mergeSnapshot(accumulator, platform, turns) {
  for (const turn of turns) core.mergeTurn(accumulator, { platform, ...turn });
}

test("merges overlapping virtualized snapshots in top-to-bottom order", () => {
  const accumulator = core.createTurnAccumulator();
  mergeSnapshot(accumulator, "grok", [
    { role: "human", content: "question 1", messageId: "response-1" },
    { role: "ai", content: "answer 1", messageId: "response-1" },
  ]);
  mergeSnapshot(accumulator, "grok", [
    { role: "ai", content: "answer 1", messageId: "response-1" },
    { role: "human", content: "question 2", messageId: "response-2" },
  ]);
  mergeSnapshot(accumulator, "grok", [
    { role: "human", content: "question 2", messageId: "response-2" },
    { role: "ai", content: "answer 2", messageId: "response-2" },
  ]);

  const turns = core.orderedTurns(accumulator);
  assert.deepEqual(
    Array.from(turns, (turn) => `${turn.role}:${turn.content}`),
    ["human:question 1", "ai:answer 1", "human:question 2", "ai:answer 2"],
  );
});

test("keeps user and assistant messages that share a Grok response container", () => {
  const accumulator = core.createTurnAccumulator();
  mergeSnapshot(accumulator, "grok", [
    { role: "human", content: "same container user", messageId: "response-42" },
    { role: "ai", content: "same container assistant", messageId: "response-42" },
  ]);
  assert.equal(core.orderedTurns(accumulator).length, 2);
});

test("uses ChatGPT turn numbers to restore order across remounted snapshots", () => {
  const accumulator = core.createTurnAccumulator();
  mergeSnapshot(accumulator, "chatgpt", [
    { role: "human", content: "turn 4", turnNumber: 4, messageId: "turn-4" },
    { role: "ai", content: "turn 5", turnNumber: 5, messageId: "turn-5" },
  ]);
  mergeSnapshot(accumulator, "chatgpt", [
    { role: "human", content: "turn 0", turnNumber: 0, messageId: "turn-0" },
    { role: "ai", content: "turn 1", turnNumber: 1, messageId: "turn-1" },
    { role: "human", content: "turn 2", turnNumber: 2, messageId: "turn-2" },
    { role: "ai", content: "turn 3", turnNumber: 3, messageId: "turn-3" },
  ]);
  assert.deepEqual(Array.from(core.orderedTurns(accumulator), (turn) => turn.turnNumber), [0, 1, 2, 3, 4, 5]);
});

test("reports success only after both traversal boundaries are proven", () => {
  const turns = [
    { role: "human", content: "question", turnNumber: 0 },
    { role: "ai", content: "answer", turnNumber: 1 },
  ];
  const complete = core.assessCaptureQuality(turns, {
    platform: "chatgpt",
    traversal: { reachedTop: true, reachedBottom: true },
  });
  assert.equal(complete.complete, true);
  assert.equal(complete.scrollComplete, true);

  const tailOnly = core.assessCaptureQuality(turns, {
    platform: "chatgpt",
    traversal: { reachedTop: false, reachedBottom: true },
  });
  assert.equal(tailOnly.complete, false);
  assert.match(tailOnly.warnings.join("\n"), /頂端/);
});

test("keeps Claude and Gemini identities off the ChatGPT key namespace", () => {
  const accumulator = core.createTurnAccumulator();
  mergeSnapshot(accumulator, "claude", [
    { role: "human", content: "same text", messageId: "m1" },
  ]);
  mergeSnapshot(accumulator, "gemini", [
    { role: "human", content: "same text", messageId: "m1" },
  ]);
  mergeSnapshot(accumulator, "chatgpt", [
    { role: "human", content: "same text", messageId: "m1" },
  ]);
  assert.equal(core.orderedTurns(accumulator).length, 3);
});

test("flags a gap in captured ChatGPT turn numbers", () => {
  const report = core.assessCaptureQuality([
    { role: "human", content: "question", turnNumber: 0 },
    { role: "ai", content: "answer", turnNumber: 2 },
  ], {
    platform: "chatgpt",
    traversal: { reachedTop: true, reachedBottom: true },
  });
  assert.deepEqual([...report.missingTurnNumbers], [1]);
  assert.equal(report.complete, false);
});
