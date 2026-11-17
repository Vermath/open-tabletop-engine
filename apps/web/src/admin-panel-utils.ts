import type { AdminScimGroupRoleMapping } from "./api.js";
import { recordValue } from "./sheet-format.js";

export function scimMappingLabel(mapping: AdminScimGroupRoleMapping): string {
  return mapping.group?.displayName ?? mapping.groupDisplayName ?? mapping.groupExternalId ?? mapping.groupId ?? "Unmatched SCIM group";
}

export function aiToolCallErrorCode(output: unknown): string | undefined {
  const error = recordValue(output).error;
  return typeof error === "string" && error.trim() ? error.trim() : undefined;
}
