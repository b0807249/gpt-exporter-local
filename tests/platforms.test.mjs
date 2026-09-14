import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(projectRoot, "extension", "src", "platforms.js"), "utf8");
const context = vm.createContext({});
vm.runInContext(source, context);
const platforms = context.LlmExporterPlatforms;

test("maps the four web chat hosts and rejects other AI surfaces", () => {
  assert.equal(platforms.detectPlatform("chatgpt.com"), "chatgpt");
  assert.equal(platforms.detectPlatform("chat.openai.com"), "chatgpt");
  assert.equal(platforms.detectPlatform("grok.com"), "grok");
  assert.equal(platforms.detectPlatform("claude.ai"), "claude");
  assert.equal(platforms.detectPlatform("www.claude.ai"), "claude");
  assert.equal(platforms.detectPlatform("gemini.google.com"), "gemini");
  assert.equal(platforms.detectPlatform("x.com"), null);
  assert.equal(platforms.detectPlatform("aistudio.google.com"), null);
  assert.equal(platforms.detectPlatform("console.anthropic.com"), null);
  assert.match(platforms.supportedHostsMessage(), /claude\.ai/);
  assert.equal(platforms.sourceLabel("claude"), "Claude");
  assert.equal(platforms.sourceLabel("gemini"), "Gemini");
});

test("strips Gemini you-said chrome and duplicate user text", () => {
  const raw = "##### 你說了 Hello?\n\nHello?";
  assert.equal(platforms.stripChatChrome(raw), "Hello?");
});

test("strips trailing Gemini brand from page titles", () => {
  assert.equal(
    platforms.cleanTitle("Research notes - Google Gemini", "gemini"),
    "Research notes",
  );
  assert.equal(platforms.cleanTitle("研究筆記 | ChatGPT", "chatgpt"), "研究筆記");
});
