const SOURCE_LABELS = {
  chatgpt: "ChatGPT",
  grok: "Grok",
  claude: "Claude",
  gemini: "Gemini",
};

export function normalizeTags(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  return [...new Set(raw.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 24);
}

export function safeFilename(value) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 120);
  return normalized || "conversation";
}

function isoDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function sourceLabel(platform) {
  return SOURCE_LABELS[platform] || SOURCE_LABELS.chatgpt;
}

export function buildMarkdownDocument({ metadata, capture }) {
  if (!capture || !Array.isArray(capture.turns) || capture.turns.length === 0) {
    throw new Error("沒有可匯出的對話回合。");
  }

  const label = sourceLabel(capture.platform);
  const title = String(metadata?.title || capture.title || `${label} conversation`).trim();
  const created = isoDate(metadata?.created || capture.capturedAt);
  const quality = capture.quality || {};
  const normalized = {
    title,
    created,
    language: String(metadata?.language || "zh-TW").trim() || "zh-TW",
    tags: normalizeTags(metadata?.tags),
    complete: quality.complete === true,
    turnCount: Number(quality.turnCount ?? capture.turns.length),
    humanCount: Number(quality.humanCount ?? capture.turns.filter((turn) => turn.role === "human").length),
    aiCount: Number(quality.aiCount ?? capture.turns.filter((turn) => turn.role === "ai").length),
    warnings: Array.isArray(quality.warnings) ? quality.warnings : [],
  };

  const sections = capture.turns.map((turn) => {
    const role = turn.role === "human" ? "Human" : "AI";
    const content = String(turn.content ?? "").trim() || "_(empty turn)_";
    return `### ${role}\n\n${content}`;
  });

  const details = [
    `> Source: ${label} · Exported: ${normalized.created}`,
    `> Language: ${normalized.language} · Turns: ${normalized.turnCount} (Human ${normalized.humanCount}, AI ${normalized.aiCount})`,
  ];
  if (normalized.tags.length > 0) details.push(`> Tags: ${normalized.tags.join(", ")}`);

  const warning = normalized.complete
    ? []
    : [
        "",
        `> **Capture warning:** This conversation may be incomplete. Compare it with the original ${label} page.`,
        ...normalized.warnings.map((item) => `> - ${String(item).replace(/\s+/g, " ").trim()}`),
      ];

  const content = [
    `# ${title}`,
    "",
    ...details,
    ...warning,
    "",
    "## Conversation",
    "",
    sections.join("\n\n"),
    "",
  ].join("\n");

  return {
    content,
    filename: `${safeFilename(title)}.md`,
    metadata: normalized,
  };
}
