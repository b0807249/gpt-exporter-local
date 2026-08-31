# Security and privacy

## Security model

GPT&Grok Exporter Local is intentionally local-only and user-triggered:

- no remote backend or analytics
- no network request code
- no persistent host permission
- no cookie, history, storage, downloads, clipboard, or background permissions
- content capture starts only after the toolbar popup button is clicked
- generated content is downloaded with a browser-created local object URL

The extension reads only DOM content rendered in the active supported ChatGPT or Grok tab. It does not access hidden model reasoning, OpenAI or xAI APIs, account cookies, or server-side conversation data.

## Data handling

Captured ChatGPT or Grok conversation data exists in the active tab's injected script and the extension popup while it is open. It is not persisted by the extension. Closing the popup discards the in-memory capture unless the user downloaded the generated file.

The downloaded file can contain everything visible in the conversation. Users remain responsible for reviewing secrets, personal data, protected health information, and confidential material before moving the file elsewhere.

## Review checklist

Before each release:

1. Run `npm test` and `npm run check`.
2. Confirm `manifest.json` permissions remain exactly `activeTab` and `scripting`.
3. Confirm there is no `host_permissions`, background worker, remotely hosted code, or network API usage.
4. Load the unpacked extension in a clean Chrome profile and test a synthetic or non-sensitive short, medium, and long conversation.
5. Inspect the downloaded `.md` for role order, code fences, lists, tables, links, Unicode, and quality warnings.
6. Run `npm run audit:public` from the release candidate with its final Git history.

The green no-warning state means both scroll boundaries were reached and no current heuristic warning fired. It does not prove byte-for-byte completeness after an upstream DOM change; important exports should still be spot-checked against the source page.

## Reporting a vulnerability

Do not include real credentials, private conversations, or patient data in a report. Provide a minimal synthetic reproduction instead.
