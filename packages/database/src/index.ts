export const tableNames = [
  "users",
  "campaigns",
  "campaign_members",
  "worlds",
  "scenes",
  "scene_layers",
  "map_assets",
  "tokens",
  "actors",
  "items",
  "journal_entries",
  "handouts",
  "chat_messages",
  "dice_rolls",
  "encounters",
  "combats",
  "combat_turns",
  "compendium_packs",
  "plugins",
  "system_modules",
  "permission_grants",
  "audit_logs",
  "proposals",
  "ai_threads",
  "ai_memory_facts",
  "ai_tool_calls"
] as const;

export const migrationPlan = [
  "0001_core_identity_campaigns",
  "0002_scenes_assets_tokens",
  "0003_actors_items_journals_chat",
  "0004_combat_compendia_permissions",
  "0005_plugins_systems_ai_proposals"
] as const;
