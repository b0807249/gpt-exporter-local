(() => {
  "use strict";

  const INSTALL_GUARD = "__llmExporterLocalInstalledV133";
  const CAPTURE_MESSAGE = "LLM_EXPORTER_CAPTURE_V1";
  const CAPTURE_CORE = globalThis.GptExporterCaptureCore;
  const PLATFORMS = globalThis.LlmExporterPlatforms;

  if (globalThis[INSTALL_GUARD]) return;
  if (!CAPTURE_CORE) throw new Error("LLM Exporter capture core was not loaded.");
  if (!PLATFORMS) throw new Error("LLM Exporter platforms were not loaded.");
  globalThis[INSTALL_GUARD] = true;

  const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  function isElement(value) {
    return value instanceof Element;
  }

  function isVisible(element) {
    if (!isElement(element)) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function normalizeRole(value) {
    const role = String(value || "").toLowerCase();
    if (role === "user" || role === "human") return "human";
    if (role === "assistant" || role === "ai" || role === "model" || role === "bot") return "ai";
    return null;
  }

  function detectPlatform() {
    return PLATFORMS.detectPlatform(location.hostname);
  }

  function queryAllDeep(selector, root = document) {
    const results = [];
    const visit = (node) => {
      if (!node?.querySelectorAll) return;
      results.push(...node.querySelectorAll(selector));
      for (const element of node.querySelectorAll("*")) {
        if (element.shadowRoot) visit(element.shadowRoot);
      }
    };
    visit(root);
    return results;
  }

  function uniqueDocuments(nodes) {
    return [...new Set(nodes)];
  }

  function outermostNodes(nodes) {
    const unique = uniqueDocuments(nodes);
    return unique.filter((node) => !unique.some((other) => other !== node && other.contains(node)));
  }

  function classNames(node) {
    return String(node.getAttribute("class") || node.className || "").toLowerCase();
  }

  function composedParent(element) {
    if (!element) return null;
    if (element.parentElement) return element.parentElement;
    const root = element.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  }

  function roleNodesForPlatform(platform) {
    if (platform === "grok") {
      return [...document.querySelectorAll("[data-testid='user-message'], [data-testid='assistant-message']")];
    }
    if (platform === "claude") {
      const users = outermostNodes([
        ...document.querySelectorAll('[data-testid="user-message"]'),
        ...document.querySelectorAll('[class*="font-user-message"]'),
      ]);
      const assistantCandidates = [
        ...document.querySelectorAll('[data-testid="assistant-message"], [data-testid="ai-message"], [data-testid="message-assistant"]'),
        ...document.querySelectorAll(".font-claude-response, [class*='font-claude-response']"),
      ];
      const streamingFallback = assistantCandidates.length === 0
        ? [...document.querySelectorAll("[data-is-streaming]")]
        : [];
      const assistants = outermostNodes([...assistantCandidates, ...streamingFallback])
        .filter((node) => !node.closest('[data-testid="user-message"]'));
      return [...users, ...assistants];
    }
    if (platform === "gemini") {
      return uniqueDocuments(queryAllDeep("user-query, model-response"));
    }
    return [...document.querySelectorAll("[data-message-author-role]")];
  }

  function roleForNode(node, platform) {
    if (platform === "grok") {
      return node.getAttribute("data-testid") === "user-message" ? "human" : "ai";
    }
    if (platform === "claude") {
      const testId = String(node.getAttribute("data-testid") || "").toLowerCase();
      if (testId.includes("user") || testId.includes("human")) return "human";
      if (testId.includes("assistant") || testId === "ai-message" || testId.includes("message-assistant")) return "ai";
      const className = classNames(node);
      if (className.includes("font-user") || className.includes("user-message")) return "human";
      if (className.includes("font-claude") || className.includes("claude-response") || className.includes("claude-message")) {
        return "ai";
      }
      if (node.hasAttribute("data-is-streaming")) return "ai";
      return null;
    }
    if (platform === "gemini") {
      const tag = node.tagName.toLowerCase();
      if (tag === "user-query") return "human";
      if (tag === "model-response") return "ai";
      return null;
    }
    return normalizeRole(node.getAttribute("data-message-author-role"));
  }

  function messageIdentity(node, platform) {
    if (platform === "grok") return node.closest("[id^='response-']")?.id || "";
    if (platform === "claude") {
      return node.getAttribute("data-message-id")
        || node.closest("[data-message-id]")?.getAttribute("data-message-id")
        || node.closest("[data-test-render-count]")?.getAttribute("data-test-render-count")
        || "";
    }
    if (platform === "gemini") {
      return node.getAttribute("id")
        || node.getAttribute("data-response-id")
        || node.getAttribute("data-turn-id")
        || "";
    }
    const turnNumber = turnNumberFromNode(node);
    return Number.isInteger(turnNumber) ? `turn-${turnNumber}` : "";
  }

  function turnNumberFromNode(node) {
    const turn = node.closest('[data-testid^="conversation-turn-"]');
    const testId = turn?.getAttribute("data-testid") || "";
    const match = testId.match(/conversation-turn-(\d+)/);
    return match ? Number(match[1]) : null;
  }

  function longestBacktickRun(value) {
    let longest = 0;
    for (const match of String(value).matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
    return longest;
  }

  function cleanInline(value) {
    return String(value)
      .replace(/[\t\f\v ]+/g, " ")
      .replace(/ *\n */g, " ")
      .trim();
  }

  function safeLink(href) {
    const value = String(href || "").trim();
    if (!value || /^(javascript|data|vbscript):/i.test(value)) return "";
    return value;
  }

  function codeLanguage(pre) {
    const code = pre.querySelector("code");
    const classNames = [code?.className, pre.className].filter(Boolean).join(" ");
    const classMatch = classNames.match(/(?:language-|lang-)([a-z0-9_+#.-]+)/i);
    if (classMatch) return classMatch[1];

    const nearbyLabel = pre.querySelector('[class*="language"], [data-language]');
    const label = nearbyLabel?.getAttribute("data-language") || nearbyLabel?.textContent || "";
    return /^[a-z0-9_+#.-]{1,24}$/i.test(label.trim()) ? label.trim() : "";
  }

  function tableToMarkdown(table) {
    const rows = [...table.querySelectorAll("tr")].map((row) =>
      [...row.querySelectorAll(":scope > th, :scope > td")].map((cell) =>
        cleanInline(cell.textContent).replace(/\|/g, "\\|")
      )
    ).filter((row) => row.length > 0);

    if (rows.length === 0) return "";
    const width = Math.max(...rows.map((row) => row.length));
    const normalized = rows.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill("")]);
    const header = normalized[0];
    const separator = header.map(() => "---");
    const lines = [header, separator, ...normalized.slice(1)];
    return `${lines.map((row) => `| ${row.join(" | ")} |`).join("\n")}\n\n`;
  }

  function skipChrome(node) {
    const tag = node.tagName.toLowerCase();
    if (["script", "style", "button", "svg", "canvas", "textarea", "input", "select", "option", "nav", "form", "noscript"].includes(tag)) {
      return true;
    }
    if (tag === "model-thoughts" || tag === "thoughts-panel") return true;
    const testId = String(node.getAttribute("data-testid") || "").toLowerCase();
    if (testId.includes("thought") || testId === "copy" || testId.includes("toolbar")) return true;
    if (node.getAttribute("aria-hidden") === "true" || node.hidden) return true;
    return false;
  }

  function nodeToMarkdown(node, context = {}) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
    if (!isElement(node)) return "";
    if (skipChrome(node)) return "";

    const tag = node.tagName.toLowerCase();

    if (tag === "slot") {
      const assigned = typeof node.assignedNodes === "function"
        ? node.assignedNodes({ flatten: true })
        : [];
      return assigned.map((child) => nodeToMarkdown(child, context)).join("");
    }

    if (tag === "pre") {
      const code = node.querySelector("code")?.textContent ?? node.textContent ?? "";
      const fenceLength = Math.max(3, longestBacktickRun(code) + 1);
      const fence = "`".repeat(fenceLength);
      return `\n\n${fence}${codeLanguage(node)}\n${code.replace(/^\n|\n$/g, "")}\n${fence}\n\n`;
    }

    if (tag === "code") {
      if (node.closest("pre")) return "";
      const code = cleanInline(node.textContent);
      const delimiter = "`".repeat(Math.max(1, longestBacktickRun(code) + 1));
      return code ? `${delimiter}${code}${delimiter}` : "";
    }

    if (tag === "br") return "\n";
    if (tag === "hr") return "\n\n---\n\n";
    if (tag === "img") {
      const alt = cleanInline(node.getAttribute("alt"));
      return alt ? `[Image: ${alt}]` : "[Image]";
    }

    if (tag === "table") return tableToMarkdown(node);

    const children = () => {
      if (node.shadowRoot) {
        return [...node.shadowRoot.childNodes].map((child) => nodeToMarkdown(child, context)).join("");
      }
      return [...node.childNodes].map((child) => nodeToMarkdown(child, context)).join("");
    };

    if (/^h[1-6]$/.test(tag)) {
      const headingText = cleanInline(node.textContent);
      if (/^(你說了|you said)(?:\s|$)/i.test(headingText)) return "";
      const level = Number(tag.slice(1));
      return `\n\n${"#".repeat(level)} ${cleanInline(children())}\n\n`;
    }

    if (tag === "p") return `\n\n${children()}\n\n`;
    if (tag === "strong" || tag === "b") return `**${children()}**`;
    if (tag === "em" || tag === "i") return `_${children()}_`;
    if (tag === "del" || tag === "s") return `~~${children()}~~`;

    if (tag === "a") {
      const label = cleanInline(children()) || cleanInline(node.textContent);
      const href = safeLink(node.href || node.getAttribute("href"));
      return href && label ? `[${label}](${href})` : label;
    }

    if (tag === "blockquote") {
      const value = normalizeMarkdown(children());
      return `\n\n${value.split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
    }

    if (tag === "ul" || tag === "ol") {
      const ordered = tag === "ol";
      const start = ordered ? Number(node.getAttribute("start") || 1) : 1;
      const items = [...node.children].filter((child) => child.tagName.toLowerCase() === "li");
      const lines = items.map((item, index) => {
        const marker = ordered ? `${start + index}.` : "-";
        const value = normalizeMarkdown(nodeToMarkdown(item, { ...context, inList: true }));
        const indented = value.split("\n").map((line, lineIndex) => lineIndex === 0 ? line : `  ${line}`).join("\n");
        return `${marker} ${indented}`;
      });
      return `\n\n${lines.join("\n")}\n\n`;
    }

    if (tag === "li") return children();

    if (["div", "section", "article", "header", "footer", "main", "figure", "figcaption", "details", "summary", "dl", "dt", "dd"].includes(tag)) {
      const value = children();
      return context.inList ? value : `${value}\n`;
    }

    return children();
  }

  function normalizeMarkdown(value) {
    return String(value)
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function firstDeep(node, selector) {
    if (!isElement(node)) return null;
    if (node.matches?.(selector)) return node;
    const local = node.querySelector?.(selector);
    if (local) return local;
    return queryAllDeep(selector, node)[0] || null;
  }

  function firstDeepByPriority(node, selectors) {
    for (const selector of selectors) {
      const found = firstDeep(node, selector);
      if (found) return found;
    }
    return null;
  }

  function contentRoot(roleNode, platform) {
    if (platform === "grok") return roleNode;
    if (platform === "claude") {
      if (roleForNode(roleNode, "claude") === "human") return roleNode;
      const answerRow = roleNode.querySelector(".row-start-2");
      const scope = answerRow || roleNode;
      return firstDeep(scope, ".standard-markdown, .font-claude-response-body, [class*='standard-markdown']") || scope;
    }
    if (platform === "gemini") {
      const tag = roleNode.tagName.toLowerCase();
      if (tag === "user-query") {
        return firstDeepByPriority(roleNode, [
          ".query-text",
          ".query-content",
          ".user-query-bubble-with-background",
        ]) || roleNode;
      }
      return firstDeepByPriority(roleNode, [
        ".markdown-main-panel",
        "message-content.model-response-text",
        "message-content",
        ".model-response-text",
      ]) || roleNode;
    }
    const turn = roleNode.closest('[data-testid^="conversation-turn-"]');
    if (!turn) return roleNode;

    if (normalizeRole(roleNode.getAttribute("data-message-author-role")) === "ai") {
      return roleNode.querySelector(".markdown, [class*='markdown']") || roleNode;
    }

    return roleNode.querySelector('[data-message-author-role="user"]') || roleNode;
  }

  function usesComposedTree(node, platform) {
    return platform === "gemini" || Boolean(node?.shadowRoot);
  }

  function markdownFromRoleNode(roleNode, platform) {
    const source = contentRoot(roleNode, platform);
    let content;
    if (usesComposedTree(source, platform) || usesComposedTree(roleNode, platform)) {
      content = normalizeMarkdown(nodeToMarkdown(source));
    } else {
      const clone = source.cloneNode(true);
      clone.querySelectorAll([
        "script", "style", "button", "svg", "canvas", "textarea", "input", "select", "nav", "form", "noscript",
        '[aria-hidden="true"]', "[hidden]", ".sr-only", "[data-state='closed']",
      ].join(",")).forEach((element) => element.remove());
      content = normalizeMarkdown(nodeToMarkdown(clone));
    }
    if (platform === "gemini" && roleForNode(roleNode, platform) === "human") {
      content = PLATFORMS.stripChatChrome(content);
    }
    return content;
  }

  function collectTurns(accumulator, platform) {
    const roleNodes = roleNodesForPlatform(platform);
    for (const roleNode of roleNodes) {
      const role = roleForNode(roleNode, platform);
      if (!role || !isVisible(roleNode)) continue;
      const content = markdownFromRoleNode(roleNode, platform);
      if (!content) continue;

      const turnNumber = turnNumberFromNode(roleNode);
      const identity = messageIdentity(roleNode, platform);
      CAPTURE_CORE.mergeTurn(accumulator, {
        platform,
        role,
        content,
        turnNumber,
        messageId: identity,
      });
    }
  }

  function scrollContainerFor(element) {
    let current = composedParent(element);
    while (current && current !== document.body) {
      const style = getComputedStyle(current);
      if (/(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight + 16) return current;
      current = composedParent(current);
    }
    return document.scrollingElement || document.documentElement;
  }

  function getScrollTop(scroller) {
    return scroller === document.documentElement || scroller === document.body || scroller === document.scrollingElement
      ? window.scrollY
      : scroller.scrollTop;
  }

  function setScrollTop(scroller, value) {
    if (scroller === document.documentElement || scroller === document.body || scroller === document.scrollingElement) {
      window.scrollTo({ top: value, behavior: "auto" });
    } else {
      scroller.scrollTo({ top: value, behavior: "auto" });
    }
  }

  function scrollerMetrics(scroller) {
    if (scroller === document.documentElement || scroller === document.body || scroller === document.scrollingElement) {
      const root = document.scrollingElement || document.documentElement;
      return { top: window.scrollY, height: window.innerHeight, scrollHeight: root.scrollHeight };
    }
    return { top: scroller.scrollTop, height: scroller.clientHeight, scrollHeight: scroller.scrollHeight };
  }

  async function settleAtTop(accumulator, scroller, platform) {
    let stablePasses = 0;
    let previousScrollHeight = -1;
    let passes = 0;

    while (passes < 24 && stablePasses < 2) {
      setScrollTop(scroller, 0);
      await delay(90);
      collectTurns(accumulator, platform);
      const metrics = scrollerMetrics(scroller);
      const heightStable = Math.abs(metrics.scrollHeight - previousScrollHeight) <= 8;
      stablePasses = metrics.top <= 8 && heightStable ? stablePasses + 1 : 0;
      previousScrollHeight = metrics.scrollHeight;
      passes += 1;
    }

    return { reachedTop: stablePasses >= 2 && scrollerMetrics(scroller).top <= 8, passes };
  }

  async function sweepByViewport(accumulator, scroller, platform) {
    const topResult = await settleAtTop(accumulator, scroller, platform);
    let iterations = 0;
    let bottomStablePasses = 0;
    let previousBottomHeight = -1;
    let stalledPasses = 0;
    let previousTop = -1;

    while (iterations < 600 && bottomStablePasses < 2) {
      collectTurns(accumulator, platform);
      const metrics = scrollerMetrics(scroller);
      const atBottom = metrics.top + metrics.height >= metrics.scrollHeight - 8;

      if (atBottom) {
        const heightStable = Math.abs(metrics.scrollHeight - previousBottomHeight) <= 8;
        bottomStablePasses = heightStable ? bottomStablePasses + 1 : 0;
        previousBottomHeight = metrics.scrollHeight;
        await delay(90);
      } else {
        bottomStablePasses = 0;
        const nextTop = Math.min(
          Math.max(0, metrics.scrollHeight - metrics.height),
          metrics.top + Math.max(240, metrics.height * 0.72),
        );
        stalledPasses = nextTop <= metrics.top + 1 || metrics.top === previousTop ? stalledPasses + 1 : 0;
        if (stalledPasses >= 3) break;
        previousTop = metrics.top;
        setScrollTop(scroller, nextTop);
        await delay(55);
      }
      iterations += 1;
    }

    collectTurns(accumulator, platform);
    return {
      reachedTop: topResult.reachedTop,
      reachedBottom: bottomStablePasses >= 2,
      topPasses: topResult.passes,
      viewportPasses: iterations,
    };
  }

  function pageTitle() {
    const platform = detectPlatform();
    const fallback = PLATFORMS.titleFallback(platform);
    const title = PLATFORMS.cleanTitle(document.title, platform);
    return title && !/^(chatgpt|grok|claude|gemini|google)$/i.test(title) ? title : fallback;
  }

  async function captureConversation() {
    const platform = detectPlatform();
    if (!platform) throw new Error(`這個分頁不是支援的對話網址。請開啟 ${PLATFORMS.supportedHostsMessage()} 的對話。`);

    const initialRoleNode = roleNodesForPlatform(platform)[0];
    if (!initialRoleNode) {
      throw new Error(`找不到 ${PLATFORMS.sourceLabel(platform)} 對話內容。請確認這是已載入完成的對話頁面。`);
    }

    const accumulator = CAPTURE_CORE.createTurnAccumulator();
    const scroller = scrollContainerFor(initialRoleNode);
    const originalScrollTop = getScrollTop(scroller);
    let traversal = { reachedTop: false, reachedBottom: false, topPasses: 0, viewportPasses: 0 };
    const strategy = `${platform}-full-viewport-sweep`;

    try {
      traversal = await sweepByViewport(accumulator, scroller, platform);
    } finally {
      setScrollTop(scroller, originalScrollTop);
    }

    const turns = CAPTURE_CORE.orderedTurns(accumulator).map(({ sequence: _sequence, ...turn }) => turn);
    const quality = CAPTURE_CORE.assessCaptureQuality(turns, {
      traversal,
      platform,
    });
    if (turns.length === 0) throw new Error("沒有擷取到可匯出的對話回合。");

    return {
      title: pageTitle(),
      platform,
      capturedAt: new Date().toISOString(),
      strategy,
      traversal,
      turns,
      quality,
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== CAPTURE_MESSAGE) return undefined;
    captureConversation()
      .then((capture) => sendResponse({ ok: true, capture }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  });
})();
