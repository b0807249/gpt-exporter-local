import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = path.join(projectRoot, "extension");

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.(js|json|html|css)$/.test(entry.name) ? [fullPath] : [];
  }));
  return nested.flat();
}

test("manifest keeps the minimum permission set", async () => {
  const manifest = JSON.parse(await readFile(path.join(extensionRoot, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "LLM Exporter Local");
  assert.equal(manifest.version, "1.3.0");
  assert.deepEqual([...manifest.permissions].sort(), ["activeTab", "scripting"]);
  assert.equal("host_permissions" in manifest, false);
  assert.equal("optional_host_permissions" in manifest, false);
  assert.equal("background" in manifest, false);
  assert.equal("content_scripts" in manifest, false);
});

test("extension source contains no network or remote-code primitives", async () => {
  const files = await sourceFiles(extensionRoot);
  const forbidden = [
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /\bWebSocket\s*\(/,
    /sendBeacon\s*\(/,
    /EventSource\s*\(/,
    /<script[^>]+src=["']https?:/i,
    /import\s*\([^)]*https?:/i,
  ];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const pattern of forbidden) {
      assert.equal(pattern.test(source), false, `${path.relative(projectRoot, file)} matched ${pattern}`);
    }
  }
});

test("capture scope is four web chats and user-triggered", async () => {
  const popup = await readFile(path.join(extensionRoot, "popup.js"), "utf8");
  const content = await readFile(path.join(extensionRoot, "src", "content.js"), "utf8");
  const platforms = await readFile(path.join(extensionRoot, "src", "platforms.js"), "utf8");
  const combined = `${popup}\n${content}\n${platforms}`;

  assert.match(combined, /LLM_EXPORTER_CAPTURE_V1/);
  assert.match(combined, /chatgpt\.com/);
  assert.match(combined, /chat\.openai\.com/);
  assert.match(combined, /grok\.com/);
  assert.match(combined, /claude\.ai/);
  assert.match(combined, /gemini\.google\.com/);
  assert.doesNotMatch(combined, /x\.com|twitter\.com|aistudio\.google|console\.anthropic/i);
  assert.match(content, /chrome\.runtime\.onMessage\.addListener/);
  assert.doesNotMatch(content, /setInterval\s*\(/);
});

test("user-facing product exports ordinary Markdown without LTF branding", async () => {
  const manifest = await readFile(path.join(extensionRoot, "manifest.json"), "utf8");
  const popupHtml = await readFile(path.join(extensionRoot, "popup.html"), "utf8");
  const serializer = await readFile(path.join(extensionRoot, "src", "ltf.js"), "utf8");
  const userFacingSource = `${manifest}\n${popupHtml}\n${serializer}`;

  assert.doesNotMatch(userFacingSource, /localthink|\.ltf\.md|x_capture/i);
  assert.match(popupHtml, /下載 \.md/);
  assert.match(serializer, /\.md`/);
});

test("capture adapter includes four-platform selectors and quality checks", async () => {
  const content = await readFile(path.join(extensionRoot, "src", "content.js"), "utf8");
  const popup = await readFile(path.join(extensionRoot, "popup.js"), "utf8");
  assert.match(content, /data-message-author-role/);
  assert.match(content, /conversation-turn-/);
  assert.match(content, /user-message/);
  assert.match(content, /assistant-message/);
  assert.match(content, /response-/);
  assert.match(content, /font-claude-response/);
  assert.match(content, /font-user-message/);
  assert.doesNotMatch(content, /if \(byTestId\.length > 0\) return/);
  assert.match(content, /firstDeepByPriority/);
  assert.match(content, /query-text/);
  assert.match(content, /model-response/);
  assert.match(content, /queryAllDeep/);
  assert.match(content, /shadowRoot/);
  assert.match(content, /settleAtTop/);
  assert.match(content, /full-viewport-sweep/);
  assert.doesNotMatch(content, /initialTurnNodes|sweepByKnownTurns|targeted-turn-sweep/);
  assert.match(popup, /capture-core\.js/);
  assert.match(popup, /platforms\.js/);
});
