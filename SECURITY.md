# Security

Report security issues privately to the maintainers. Do not open public issues for vulnerabilities.

Security-sensitive areas include:

- Campaign permissions and GM-only data.
- Plugin sandboxing and declared capability grants.
- AI context isolation, scoped authority, and auditability across its existing proposal and automatic-execution modes.
- WebSocket authorization.
- Import/export archive validation.

Public-alpha security expectations:

- Preserve the AI agent's existing governed proposal and automatic-execution modes; security work must not reduce it to proposal-only behavior. AI actions remain scoped to the invoking user's authority and auditable.
- Plugin code must use typed, permission-checked application commands rather than writing campaign storage directly.
- Plugins should request the smallest useful permission set and must not receive token, actor, journal, or campaign context unless the campaign grant allows it.
- Do not add importers that scrape proprietary services or bypass access controls.
- Keep secrets out of exported campaigns, logs, demo archives, and docs.
