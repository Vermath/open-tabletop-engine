# X01 session evidence checklist

Use this checklist for real-table dogfood sessions. It is designed to collect comparable evidence with almost no interruption to play.

## Before play

- Record the campaign, session ID, date, build or commit, GM, player count, device mix, and connection type in the evidence packet.
- Confirm the GM and at least one player are using separate accounts. Include an observer or assistant GM when that role is under test.
- Agree on privacy boundaries. Do not put player names, safety-tool details, credentials, private chat text, or other personal information in reports.
- Pick the recovery path to exercise if the session is designated for recovery testing: undo, reconnect, app restart, snapshot restore, or staff repair.

## During play

At the first useful checkpoint, the GM opens **Session Desk** and selects **Session report** beside the active session. This is one click and immediately creates a `gm_only` journal entry tagged `session-report`, `dogfood:x01`, and `session:<session-id>`.

Update the entry only when something worth preserving occurs. Keep each value short and factual:

- `breakage`: failed action, visual or rules error, crash, stall, lost update, or `none_observed`.
- `corrections`: correction attempted, who was allowed to make it, whether state converged, or `none`.
- `recovery`: `not_used`, or the exact undo, reconnect, restart, restore, or staff-repair path and its outcome.
- `privacy`: whether GM-only data, whispers, concealed rolls, hidden tokens, or private journals remained hidden; record only the category of any leak, never the secret itself.
- `manual_rulings`: ruling or unsupported mechanic handled manually, the chosen workaround, and whether play continued.

Also note conflicts or stale-write prompts under `corrections`, including which edit won and whether either participant lost work. If play is abandoned, write the stopping point, blocking symptom, last known-good state, and whether the table moved to a fallback.

## Required session variants

Across the X01 run, retain evidence for all of these cases:

- A normal session with no recovery.
- A correction after an accidental or invalid change.
- A concurrent-edit or stale-state conflict from two clients.
- A reconnect or restart with state resynchronization.
- An undo or snapshot-restore exercise.
- A staff-repair exercise, if staff tooling is in release scope.
- An intentional abandonment caused by a blocking failure or a documented `not_exercised` reason.

## After play

- Confirm the report still exists after refresh or reconnect and its `session_id` matches the session that was played.
- As a player and observer, confirm the report title, body, tags, and realtime event are not visible. Record pass or fail without copying secret content.
- For every correction, confirm the final state from both clients and preserve the relevant request, audit, or screenshot identifier.
- For every recovery, record elapsed interruption, data lost, duplicate actions, and whether manual cleanup was required.
- For manual rulings, record whether the outcome survived save, refresh, export, and restore where applicable.
- Link the journal entry ID and external evidence IDs from the session packet. Do not duplicate sensitive content into a public issue.

## Exit criteria

X01 evidence is complete when repeated sessions cover the variants above, every report contains the five structured observation fields, privacy has been checked from a non-GM account, corrections and conflicts converge without silent loss, recovery outcomes are reproducible, and every abandonment or manual ruling has a clear outcome. Any untested variant must be marked `not_exercised` with an owner and follow-up date.
