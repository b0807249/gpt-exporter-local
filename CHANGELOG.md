# Changelog

## 1.3.0 — 2026-09-15

- Renamed the extension to LLM Exporter Local.
- Added Claude and Gemini webpage capture at the same visible-turn Markdown scope as ChatGPT and Grok.
- Fixed Claude adapter so a present `user-message` test id no longer hides `.font-claude-response` assistant turns.
- Extracted a shared host/platform registry and open-shadow DOM walk for Gemini custom elements.
- Did not add Artifact, Canvas, thinking panels, desktop apps, or vendor APIs.
- Prefer Gemini `.query-text` over the wrapping bubble so the "You said" chrome is not exported; strip trailing `Google Gemini` from titles.
- Strip Gemini headings that start with 「你說了」 and collapse the duplicated user question.

## 1.2.0 — 2026-09-01

- Replaced the tail-node shortcut with a full top-to-bottom viewport sweep.
- Added boundary proof before a capture can receive the no-warning state.
- Fixed Grok user/assistant deduplication when both share one response container.
- Added virtualized-snapshot regression tests, CI, and a public-readiness audit.
- Removed local installation paths and documented release privacy checks.

## 1.1.1 — 2026-08-25

- Renamed the extension to GPT&Grok Exporter Local.

## 1.1.0 — 2026-08-25

- Added Grok conversation capture and source labelling.

## 1.0.0 — 2026-08-25

- Released local ChatGPT-to-Markdown capture with no runtime dependencies.
