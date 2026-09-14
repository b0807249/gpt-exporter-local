(() => {
  "use strict";

  const GLOBAL_KEY = "GptExporterCaptureCore";
  if (globalThis[GLOBAL_KEY]) return;

  function textHash(value) {
    let hash = 2166136261;
    const input = String(value);
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function createTurnAccumulator() {
    return { entries: new Map(), nextSequence: 0 };
  }

  function platformKey(value) {
    const platform = String(value || "").toLowerCase();
    return /^(chatgpt|grok|claude|gemini)$/.test(platform) ? platform : "chatgpt";
  }

  function turnKey(turn) {
    const platform = platformKey(turn.platform);
    const role = turn.role === "human" ? "human" : "ai";
    if (turn.messageId) return `${platform}:message:${turn.messageId}:${role}`;
    if (Number.isInteger(turn.turnNumber)) return `${platform}:turn:${turn.turnNumber}:${role}`;
    return `${platform}:content:${role}:${textHash(turn.content)}`;
  }

  function mergeTurn(accumulator, turn) {
    if (!accumulator?.entries || !turn || !String(turn.content || "").trim()) return false;
    const key = turnKey(turn);
    const previous = accumulator.entries.get(key);
    if (previous && String(previous.content).length >= String(turn.content).length) return false;

    accumulator.entries.set(key, {
      role: turn.role === "human" ? "human" : "ai",
      content: String(turn.content),
      turnNumber: Number.isInteger(turn.turnNumber) ? turn.turnNumber : null,
      messageId: String(turn.messageId || ""),
      sequence: previous?.sequence ?? accumulator.nextSequence++,
    });
    return true;
  }

  function orderedTurns(accumulator) {
    const turns = [...accumulator.entries.values()];
    const numbered = turns.filter((turn) => Number.isInteger(turn.turnNumber));
    const unnumbered = turns.filter((turn) => !Number.isInteger(turn.turnNumber));
    numbered.sort((left, right) => left.turnNumber - right.turnNumber || left.sequence - right.sequence);
    unnumbered.sort((left, right) => left.sequence - right.sequence);

    if (numbered.length === 0) return unnumbered;
    const seen = new Set(numbered.map((turn) => `${turn.role}:${textHash(turn.content)}`));
    return [...numbered, ...unnumbered.filter((turn) => !seen.has(`${turn.role}:${textHash(turn.content)}`))];
  }

  function assessCaptureQuality(turns, { platform, traversal } = {}) {
    const humanCount = turns.filter((turn) => turn.role === "human").length;
    const aiCount = turns.filter((turn) => turn.role === "ai").length;
    const capturedNumbers = [...new Set(turns
      .map((turn) => turn.turnNumber)
      .filter(Number.isInteger))]
      .sort((left, right) => left - right);
    const expectedNumbers = capturedNumbers.length >= 2
      ? Array.from(
          { length: capturedNumbers.at(-1) - capturedNumbers[0] + 1 },
          (_, index) => capturedNumbers[0] + index,
        )
      : [];
    const capturedSet = new Set(capturedNumbers);
    const missingTurnNumbers = expectedNumbers.filter((number) => !capturedSet.has(number));
    const warnings = [];
    const reachedTop = traversal?.reachedTop === true;
    const reachedBottom = traversal?.reachedBottom === true;

    if (!reachedTop) warnings.push("未能確認已捲動到對話頂端，較早回合可能不完整。");
    if (!reachedBottom) warnings.push("未能確認已捲動到對話底部，較晚回合可能不完整。");
    if (humanCount === 0) warnings.push("沒有擷取到 Human 回合。");
    if (aiCount === 0) warnings.push("沒有擷取到 AI 回合。");
    if (missingTurnNumbers.length > 0) {
      warnings.push(`可能缺少回合：${missingTurnNumbers.slice(0, 12).join(", ")}${missingTurnNumbers.length > 12 ? "…" : ""}`);
    }
    if (turns.some((turn) => !turn.content.trim())) warnings.push("有空白回合，請和原始對話核對。");

    const combined = turns.map((turn) => turn.content).join("\n");
    const fenceLines = combined.match(/^`{3,}.*$/gm) || [];
    if (fenceLines.length % 2 !== 0) warnings.push("程式碼圍欄數量不成對，Markdown 可能需要修正。");

    const sameRoleAdjacency = turns.slice(1).filter((turn, index) => turn.role === turns[index].role).length;
    if (sameRoleAdjacency > 0) warnings.push(`偵測到 ${sameRoleAdjacency} 組相鄰同角色回合，請核對是否有漏訊息。`);
    if (Math.abs(humanCount - aiCount) > 1) warnings.push("Human 與 AI 回合數差距超過 1，請核對原始對話。");
    if ((platform === "grok" || platform === "gemini") && turns.length > 200) {
      warnings.push("擷取回合數異常偏高，請確認沒有包含頁面導覽文字。");
    }

    return {
      complete: warnings.length === 0,
      scrollComplete: reachedTop && reachedBottom,
      turnCount: turns.length,
      humanCount,
      aiCount,
      missingTurnNumbers,
      warnings,
    };
  }

  globalThis[GLOBAL_KEY] = Object.freeze({
    assessCaptureQuality,
    createTurnAccumulator,
    mergeTurn,
    orderedTurns,
    platformKey,
    textHash,
  });
})();
