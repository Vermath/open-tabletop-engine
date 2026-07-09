import type { CampaignMember, PermissionGrant, PermissionName, UserRole } from "./types.js";

const rolePermissions: Record<UserRole, PermissionName[]> = {
  owner: [
    "campaign.read",
    "campaign.update",
    "campaign.delete",
    "scene.read",
    "scene.create",
    "scene.update",
    "scene.delete",
    "scene.activate",
    "token.read",
    "token.create",
    "token.update",
    "token.move",
    "token.delete",
    "token.reveal",
    "actor.read",
    "actor.create",
    "actor.update",
    "actor.delete",
    "actor.readPrivate",
    "actor.updateOwned",
    "journal.read",
    "journal.readSecret",
    "journal.create",
    "journal.update",
    "journal.delete",
    "chat.read",
    "chat.write",
    "chat.moderate",
    "combat.manage",
    "plugin.install",
    "plugin.configure",
    "dice.roll",
    "ai.use",
    "ai.readPublicMemory",
    "ai.readGmMemory",
    "ai.proposeChanges",
    "ai.applyChanges"
  ],
  gm: [
    "campaign.read",
    "campaign.update",
    "scene.read",
    "scene.create",
    "scene.update",
    "scene.delete",
    "scene.activate",
    "token.read",
    "token.create",
    "token.update",
    "token.move",
    "token.delete",
    "token.reveal",
    "actor.read",
    "actor.create",
    "actor.update",
    "actor.delete",
    "actor.readPrivate",
    "actor.updateOwned",
    "journal.read",
    "journal.readSecret",
    "journal.create",
    "journal.update",
    "journal.delete",
    "chat.read",
    "chat.write",
    "chat.moderate",
    "combat.manage",
    "plugin.install",
    "plugin.configure",
    "dice.roll",
    "ai.use",
    "ai.readPublicMemory",
    "ai.readGmMemory",
    "ai.proposeChanges",
    "ai.applyChanges"
  ],
  assistant_gm: [
    "campaign.read",
    "scene.read",
    "scene.create",
    "scene.update",
    "token.read",
    "token.create",
    "token.update",
    "token.move",
    "actor.read",
    "actor.create",
    "actor.update",
    "actor.readPrivate",
    "journal.read",
    "journal.readSecret",
    "journal.create",
    "journal.update",
    "chat.read",
    "chat.write",
    "combat.manage",
    "dice.roll",
    "ai.use",
    "ai.readPublicMemory",
    "ai.readGmMemory",
    "ai.proposeChanges"
  ],
  player: [
    "campaign.read",
    "scene.read",
    "token.read",
    "token.move",
    "actor.read",
    "actor.updateOwned",
    "journal.read",
    "chat.read",
    "chat.write",
    "dice.roll",
    "ai.use",
    "ai.readPublicMemory"
  ],
  observer: ["campaign.read", "scene.read", "token.read", "actor.read", "journal.read", "chat.read"],
  plugin: [],
  ai_assistant: []
};

export function permissionsForRole(role: UserRole): PermissionName[] {
  return [...rolePermissions[role]];
}

export function hasPermission(input: {
  userId: string;
  campaignId: string;
  permission: PermissionName;
  members: CampaignMember[];
  grants: PermissionGrant[];
  now?: Date;
}): boolean {
  const member = input.members.find((item) => item.userId === input.userId && item.campaignId === input.campaignId);
  const roleAllows = member ? rolePermissions[member.role].includes(input.permission) : false;
  const now = input.now ?? new Date();
  const grantAllows = input.grants.some((grant) => {
    if (grant.campaignId !== input.campaignId) return false;
    if (grant.expiresAt) {
      const expiresAt = Date.parse(grant.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return false;
    }
    if (grant.subjectType === "user" && grant.subjectId === input.userId) return grant.permissions.includes(input.permission);
    if (member && grant.subjectType === "role" && grant.subjectId === member.role) return grant.permissions.includes(input.permission);
    return false;
  });
  return roleAllows || grantAllows;
}

export function assertPermission(input: Parameters<typeof hasPermission>[0]): void {
  if (!hasPermission(input)) {
    throw new Error(`Missing permission: ${input.permission}`);
  }
}
