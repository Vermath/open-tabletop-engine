# Three-session simulated Browser campaign — 2026-07-18

## Verdict

The live product UI supported a complete three-session, four-character campaign with six maps, three encounters, six combat rounds, dice, chat, rewards, and level advancement from 1 to 3. Final reload and read-only database verification found no blocking state loss; SQLite reported `quick_check: ok`.

This is automation-led multi-seat dogfood, not independent human evidence. Codex sequentially controlled the DM and four separate player accounts through the Browser plugin. Accordingly:

- `evidenceClass: simulated_browser_multi_seat`
- `rolesControlledBy: Codex`
- `liveProductUi: true`
- `x01HumanEvidenceSatisfied: false`

Campaign: `camp_mrq0uezud0po6htf` — **Emberwake: The Three Seals**.

## Session record

| Session | Maps | Encounter | Player-facing play | Rewards and continuity |
|---|---|---|---|---|
| 1 — Smoke at First Bell | Cinder Market; Smuggler Drain | Market Knives: 3 Cultists, 7 combatants, 2 rounds | All four seats rolled and chatted; Nox moved 10 ft, hit with a 21, and dealt 7 piercing; public drain group roll `4d20 = 26` | 300 XP and 10 gp each; half bronze bell key and route scrap; all PCs level 1 → 2 |
| 2 — Bones Beneath the Bell | Old Bell Road; Ashen Ossuary | Roadside Howls: 2 Goblin Warriors, 6 combatants, 2 rounds | All four seats rolled and chatted; Ilyra hit with Fire Bolt 24 for 4 fire; public ossuary group roll `4d20 = 43` | 600 XP and 20 gp each; counter-sigil and cracked clapper; all PCs level 2 → 3 |
| 3 — The Ember Bell | Furnace Bridge; Bellfoundry Sanctum | The Last Ring: Animated Armor, Bugbear Warrior, 2 Cultists, 8 combatants, 2 rounds | All four seats rolled and chatted; GM hazard `2d6+2 = 6`; Ilyra's Magic Missile dealt 10 force; Nox, Aric, and Maelin committed attacks through reviewed action flow | 450 XP and 50 gp each; restored First Ring and ember seal; all PCs ended level 3 at 1,350 XP |

The DM explicitly ended each combat after round 2 and adjudicated retreats or surrender, so no enemy is falsely marked defeated. Persisted enemy HP confirms the consequential actions: Cultist 1 at 2/9, Goblin Warrior 1 at 6/10, and the Bugbear Warrior at 23/33.

## Carried progression

| Character | Final build | XP | HP | GP | Persisted level-3 choices |
|---|---|---:|---:|---:|---|
| Aric Emberguard | Fighter / Champion | 1,350 | 28/28 | 98 | Champion, Improved Critical, Remarkable Athlete |
| Sister Maelin | Cleric / Life Domain | 1,350 | 24/24 | 95 | Six prepared spells including Spiritual Weapon; slots persisted at L1 2/4, L2 1/2 |
| Ilyra Ashquill | Wizard / Evoker | 1,350 | 20/20 | 93 | Ten-spell book; six prepared spells including Scorching Ray and Web; slots persisted at L1 1/4, L2 2/2 |
| Nox Quickstep | Rogue / Thief | 1,350 | 24/24 | 104 | Thief, Fast Hands, Second-Story Work |

Reward continuity reconciles: each PC retained 300 + 600 + 450 XP and 10 + 20 + 50 gp. Loot remains in the three combat reward ledgers.

## Coverage and persistence proof

- Six SVG maps were uploaded, calibrated to a 50 px square grid, activated, and used. Bellfoundry Sanctum is the sole active scene after reload.
- Three completed session records retain start/end timestamps and two scene IDs each.
- Three inactive combats persist at round 2 with 7, 6, and 8 combatants.
- 33 rolls persist: 21 public and 12 GM-only. The generated recap reports one natural 20; the highest roll was public `4d20 = 43`.
- Each player account owns three character rolls and three plain chat messages across the campaign. There are 50 chat records total, 38 public.
- Three revision-2 structured session reports remain `gm_only`; one revision-1 generated recap is `public`.
- A full Browser reload restored the campaign, final active scene, all four level-3 PCs, and all eight final-scene tokens. A read-only SQLite audit returned `quick_check: ok`.

## Data-quality findings and resolution

- Furnace Bridge originally persisted only three PC tokens. The permission-checked **Place missing party** workflow added Aric without duplicating the other characters; the scene now retains all four party tokens.
- The three completed sessions originally lacked `encounterIds`. Their exact known encounter records were reconciled through the authenticated API; Sessions 1, 2, and 3 now each retain one encounter.
- The three encounters originally lacked `tokenIds`. Their exact known monster tokens were reconciled through the authenticated API; Market Knives, Roadside Howls, and The Last Ring now retain 3, 2, and 4 tokens respectively.
- The post-Session-3 generated recap originally aggregated the entire campaign. Recap generation now has an explicit Session/Campaign scope, and session scope uses exact session bounds, scenes, tags, and linked encounters.

## Highest-priority papercuts

1. **High — stale action binding:** target/effect selections survived actor, scene, and encounter changes. Old off-scene actors remained selectable, and duplicate enemy names made stale/current targets indistinguishable. This is a credible wrong-target mutation risk.
2. **Medium — invite reliability:** consecutive invitations caused revision conflicts, and one accepted player later hit `Unknown user session`/401 until a fresh invite was issued.
3. **Medium — inaccessible encounter increments:** after the first Add, the quantity button lost its accessible name; reproduced twice.
4. **Medium — unclear damage state:** generic damage was rejected in favor of reviewed typed damage, while direct HP and summary feedback conflicted.
5. **Medium — two-stage action commit:** preview was followed by another consequence modal, and leaving the flow cancelled the action without a strong pending warning.
6. **Medium — missing session relationships:** completed sessions did not retain encounter IDs.
7. **Medium — recap scope:** “session recap” produced campaign-wide totals.
8. **Low — manual map setup:** party tokens do not carry to new scenes, which led to one missing token on Furnace Bridge.

The complete, categorized log—including workarounds and environment/simulation limitations—is in `artifacts/dogfood/x01-simulated-browser-2026-07-18/papercuts.json`.

## Remediation - 2026-07-18

All 19 recorded PC issues have been addressed in repository code. The original `papercuts.json` remains unchanged as the observation record; machine-readable resolution details and final-verification state are tracked separately in `artifacts/dogfood/x01-simulated-browser-2026-07-18/remediation.json`.

- **PC-001 through PC-006:** action context, current-scene target safety, duplicate-name clarity, invite/auth reliability, encounter-control accessibility, typed damage feedback, and final action confirmation were fixed.
- **PC-007 through PC-013:** schedule persistence, explicit recap scope, typed session/encounter/token relationships for new placements, lifecycle-synchronized GM reports, single-submit completion, and campaign-member counts were fixed.
- **PC-014 through PC-017:** Manage-owned scene navigation, authoritative active-scene reconciliation, permission-checked missing-party placement, and source-specific accessible spell labels were fixed.
- **PC-018:** development API compatibility now uses both a semantic compatibility version and an exact source fingerprint; missing or stale local API builds fail closed instead of silently serving Browser tests.
- **PC-019:** map/background inputs are bound to the exact selected scene and remount across scene changes. The Browser plugin's own uncaught filechooser timeout/kernel reset remains an external harness issue.
- **VF-001:** the API runtime image now contains the Dockerfile used as an exact fingerprint input, with packaging regression coverage.
- **VF-002:** verified realtime WebSockets no longer hold the durable mutation gate for their lifetime. Realtime authorization is read-only, and spoofed `Upgrade` headers remain serialized like ordinary mutations.

The preserved Emberwake records had exact, known relationships, so they were reconciled through authenticated, permission-checked API commands. No generic inference-based migration was added for unrelated legacy data whose attribution cannot be proven. The final `pnpm check` gate passed, the rebuilt API and Vite proxy reported the same exact fingerprint, a hard Browser reload reached `Board ready` across Cinder Market, Furnace Bridge, and Bellfoundry Sanctum, and a read-only SQLite audit returned `quick_check: ok`. Remaining evidence is limited to the external Browser-plugin behavior, EL-001 through EL-004 human/concurrency/recovery/device coverage, and subjective human validation of character-creator length.

## Evidence boundary and remaining X01 gap

This run demonstrates functional breadth and persistent campaign continuity in the live UI. It does **not** cover independent humans, concurrent clients, mixed devices/networks, genuine reconnect conflicts, snapshot restore, staff-assisted repair, or failure-driven abandonment. It must not be used to close X01's independent human-session requirement.

No credentials, invitation tokens, authentication tokens, or dice server seeds are included in the artifacts.
