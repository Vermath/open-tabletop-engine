import type { Campaign, Scene, UserRole } from "@open-tabletop/core";
import type { InviteCreateInfo } from "./api.js";

export interface CampaignSetupProgress {
  key: string;
  organizationId: string;
  userId: string;
  campaign: Campaign;
  scene?: Scene;
  onboardingCreated: boolean;
  invite?: InviteCreateInfo;
  inviteEmail?: string;
  inviteRole?: UserRole;
  inviteRequestStarted?: boolean;
  inviteCreatedWithoutLink?: boolean;
}

export interface CampaignSetupIdempotencyKeys {
  draftKey: string;
  campaign: string;
  scene: string;
  journal: string;
  invite: string;
}
