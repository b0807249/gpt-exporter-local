(() => {
  "use strict";

  const GLOBAL_KEY = "LlmExporterPlatforms";
  if (globalThis[GLOBAL_KEY]) return;

  const HOST_TO_PLATFORM = new Map([
    ["chatgpt.com", "chatgpt"],
    ["www.chatgpt.com", "chatgpt"],
    ["chat.openai.com", "chatgpt"],
    ["grok.com", "grok"],
    ["www.grok.com", "grok"],
    ["claude.ai", "claude"],
    ["www.claude.ai", "claude"],
    ["gemini.google.com", "gemini"],
    ["www.gemini.google.com", "gemini"],
  ]);

  const META = Object.freeze({
    chatgpt: Object.freeze({
      sourceLabel: "ChatGPT",
      titleFallback: "ChatGPT conversation",
      titleStrip: /ChatGPT|OpenAI/i,
    }),
    grok: Object.freeze({
      sourceLabel: "Grok",
      titleFallback: "Grok conversation",
      titleStrip: /Grok|xAI/i,
    }),
    claude: Object.freeze({
      sourceLabel: "Claude",
      titleFallback: "Claude conversation",
      titleStrip: /Claude|Anthropic/i,
    }),
    gemini: Object.freeze({
      sourceLabel: "Gemini",
      titleFallback: "Gemini conversation",
      titleStrip: /Google Gemini|Gemini|Google|Bard/i,
    }),
  });

  function detectPlatform(hostname) {
    return HOST_TO_PLATFORM.get(String(hostname || "").toLowerCase()) || null;
  }

  function sourceLabel(platform) {
    return META[platform]?.sourceLabel || "Chat";
  }

  function titleFallback(platform) {
    return META[platform]?.titleFallback || "conversation";
  }

  function cleanTitle(title, platform) {
    const brand = META[platform]?.titleStrip?.source;
    const value = String(title || "").trim();
    if (!brand) return value;
    return value.replace(new RegExp(`\\s*[|–—-]\\s*(?:${brand})\\s*$`, "i"), "").trim();
  }

  function stripChatChrome(markdown) {
    let value = String(markdown || "").replace(/\r\n?/g, "\n").trim();
    value = value.replace(/^#{1,6}\s*(?:你說了|you said)(?:\s+[^\n]*)?\n*/gim, "");
    const blocks = value.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
    const collapsed = [];
    for (const block of blocks) {
      if (collapsed.at(-1) === block) continue;
      collapsed.push(block);
    }
    return collapsed.join("\n\n");
  }

  function supportedHostsMessage() {
    return "chatgpt.com、grok.com、claude.ai 或 gemini.google.com";
  }

  globalThis[GLOBAL_KEY] = Object.freeze({
    HOST_TO_PLATFORM,
    META,
    detectPlatform,
    sourceLabel,
    titleFallback,
    cleanTitle,
    stripChatChrome,
    supportedHostsMessage,
  });
})();
