# Security

Report security issues privately to the maintainers. Do not open public issues for vulnerabilities.

Security-sensitive areas include:

- Campaign permissions and GM-only data.
- Plugin sandboxing and declared capability grants.
- AI context redaction and proposal approval.
- WebSocket authorization.
- Import/export archive validation.

Public-alpha security expectations:

- AI and plugin code must not silently mutate campaign state. Use proposals, explicit grants, approval, and audit logs.
- Plugins should request the smallest useful permission set and must not receive token, actor, journal, or campaign context unless the campaign grant allows it.
- Do not add importers that scrape proprietary services or bypass access controls.
- Keep secrets out of exported campaigns, logs, demo archives, and docs.
