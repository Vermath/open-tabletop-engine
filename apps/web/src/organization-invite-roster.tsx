import { X } from "lucide-react";
import { useState } from "react";
import type { OrganizationInviteInfo } from "./api.js";

export function filterOrganizationInvites(invites: OrganizationInviteInfo[], search: string): OrganizationInviteInfo[] {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  if (!normalizedSearch) return invites;
  return invites.filter((invite) => [
    invite.email ?? "open invite",
    invite.role,
    invite.status,
    invite.campaign.name,
  ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch)));
}

export function OrganizationInviteRoster({
  invites,
  defaultSearch = "",
  onRevoke,
}: {
  invites: OrganizationInviteInfo[];
  defaultSearch?: string;
  onRevoke(invite: OrganizationInviteInfo): void;
}) {
  const [search, setSearch] = useState(defaultSearch);
  const visibleInvites = filterOrganizationInvites(invites, search);
  return (
    <section className="asset-pressure-list" aria-label="Organization invite roster">
      <div className="operator-row">
        <strong>{visibleInvites.length === invites.length ? `${invites.length} invites` : `${visibleInvites.length} of ${invites.length} invites`}</strong>
      </div>
      <label>
        <span>Search invites</span>
        <input aria-label="Search organization invites" value={search} placeholder="Email, campaign, role, or status" onChange={(event) => setSearch(event.target.value)} />
      </label>
      {invites.length === 0 ? (
        <p className="account-summary">No organization invites.</p>
      ) : visibleInvites.length === 0 ? (
        <p className="account-summary">No organization invites match this search.</p>
      ) : (
        visibleInvites.map((invite) => (
          <div className="operator-row tool-call-row" key={invite.id}>
            <span>{invite.email ?? "Open invite"} - {invite.role} - {invite.campaign.name}</span>
            <strong>{invite.status}</strong>
            <button className="icon-button" type="button" title="Revoke invite" aria-label="Revoke invite" disabled={invite.status !== "pending"} onClick={() => onRevoke(invite)}>
              <X size={14} />
            </button>
          </div>
        ))
      )}
    </section>
  );
}
