import { buildMarkdownDocument } from "./src/ltf.js";

const PLATFORM_BY_HOST = new Map([
  ["chatgpt.com", "chatgpt"],
  ["www.chatgpt.com", "chatgpt"],
  ["chat.openai.com", "chatgpt"],
  ["grok.com", "grok"],
  ["www.grok.com", "grok"],
]);
const CAPTURE_MESSAGE = "GPT_EXPORTER_CAPTURE_V2";

const elements = {
  captureButton: document.querySelector("#captureButton"),
  downloadButton: document.querySelector("#downloadButton"),
  metadataForm: document.querySelector("#metadataForm"),
  titleInput: document.querySelector("#titleInput"),
  languageInput: document.querySelector("#languageInput"),
  tagsInput: document.querySelector("#tagsInput"),
  message: document.querySelector("#message"),
  statusPill: document.querySelector("#statusPill"),
  qualityPanel: document.querySelector("#qualityPanel"),
  qualityVerdict: document.querySelector("#qualityVerdict"),
  turnCount: document.querySelector("#turnCount"),
  humanCount: document.querySelector("#humanCount"),
  aiCount: document.querySelector("#aiCount"),
  warningList: document.querySelector("#warningList"),
  previewDetails: document.querySelector("#previewDetails"),
  preview: document.querySelector("#preview"),
};

let latestCapture = null;

function setBusy(busy) {
  elements.captureButton.disabled = busy;
  elements.captureButton.textContent = busy ? "擷取中…" : "重新擷取";
  if (busy) elements.downloadButton.disabled = true;
}

function setStatus(state, label, message, isError = false) {
  elements.statusPill.dataset.state = state;
  elements.statusPill.textContent = label;
  elements.message.textContent = message;
  elements.message.classList.toggle("error", isError);
}

function renderCapture(capture) {
  latestCapture = capture;
  const quality = capture.quality;
  elements.metadataForm.hidden = false;
  elements.qualityPanel.hidden = false;
  elements.previewDetails.hidden = false;
  const sourceLabel = capture.platform === "grok" ? "Grok" : "ChatGPT";
  elements.titleInput.value = capture.title || `${sourceLabel} conversation`;
  elements.turnCount.textContent = String(quality.turnCount);
  elements.humanCount.textContent = String(quality.humanCount);
  elements.aiCount.textContent = String(quality.aiCount);
  elements.warningList.replaceChildren();

  for (const warning of quality.warnings || []) {
    const item = document.createElement("li");
    item.textContent = warning;
    elements.warningList.append(item);
  }

  const previewText = capture.turns
    .map((turn) => `${turn.role === "human" ? "Human" : "AI"}:\n${turn.content}`)
    .join("\n\n");
  elements.preview.textContent = previewText.slice(0, 2000);
  elements.downloadButton.disabled = false;

  if (quality.complete) {
    elements.qualityVerdict.textContent = "未偵測到警告";
    setStatus("success", "已擷取", `已從 ${sourceLabel} 掃描頂端到底部並擷取 ${quality.turnCount} 個回合；下載前仍建議抽查原頁。`);
  } else {
    elements.qualityVerdict.textContent = "請檢查警告";
    setStatus("warning", "需檢查", `已擷取 ${quality.turnCount} 個回合，但偵測到可能不完整的情況。`);
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) throw new Error("找不到目前分頁。");
  const url = new URL(tab.url);
  if (!PLATFORM_BY_HOST.has(url.hostname)) {
    throw new Error("目前分頁不是支援的對話頁面。請開啟 chatgpt.com 或 grok.com 的對話後再試一次。");
  }
  return tab;
}

async function sendCaptureRequest(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["src/capture-core.js", "src/content.js"],
  });
  return chrome.tabs.sendMessage(tabId, { type: CAPTURE_MESSAGE });
}

async function captureConversation() {
  setBusy(true);
  setStatus("idle", "擷取中", "正在掃描目前對話；長對話可能需要一些時間。");
  try {
    const tab = await getActiveTab();
    const response = await sendCaptureRequest(tab.id);
    if (!response?.ok) throw new Error(response?.error || "擷取失敗，未收到有效結果。");
    renderCapture(response.capture);
  } catch (error) {
    latestCapture = null;
    elements.downloadButton.disabled = true;
    setStatus("error", "失敗", error?.message || String(error), true);
  } finally {
    setBusy(false);
  }
}

function downloadConversation() {
  if (!latestCapture) return;
  try {
    const documentResult = buildMarkdownDocument({
      metadata: {
        title: elements.titleInput.value,
        language: elements.languageInput.value,
        tags: elements.tagsInput.value,
        created: latestCapture.capturedAt,
      },
      capture: latestCapture,
    });
    const blob = new Blob([documentResult.content], { type: "text/markdown;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = documentResult.filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    setStatus("success", "已下載", `已在本機下載 ${documentResult.filename}`);
  } catch (error) {
    setStatus("error", "失敗", error?.message || String(error), true);
  }
}

elements.captureButton.addEventListener("click", captureConversation);
elements.downloadButton.addEventListener("click", downloadConversation);
