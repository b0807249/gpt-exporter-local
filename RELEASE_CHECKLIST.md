# Public release checklist

- [ ] Version matches in `package.json` and `extension/manifest.json`.
- [ ] `npm test` and `npm run check` pass.
- [ ] `npm run audit:public` passes against the exact release history.
- [ ] The Git history contains only GitHub noreply author metadata.
- [ ] No `.env`, credentials, cookies, browser profiles, local databases, exports, archives, or real conversation fixtures are tracked.
- [ ] No local absolute path, personal email, patient data, private project identifier, or private URL appears in code, docs, issues, screenshots, or examples.
- [ ] A clean Chrome profile passes synthetic short, medium, and virtualized long-conversation tests on both supported platforms.
- [ ] The downloaded Markdown is checked for role order, Unicode, lists, tables, links, code fences, and capture warnings.
- [ ] Manifest permissions remain exactly `activeTab` and `scripting`; no host permission, background worker, analytics, remote code, or network request is added.
- [ ] `NOTICE`, `LICENSE`, `SECURITY.md`, and `CHANGELOG.md` are included.

Do not publish from the private development history. Build the public repository from the reviewed release tree as a new root commit, run the audit there, and only then create or update the remote repository.
