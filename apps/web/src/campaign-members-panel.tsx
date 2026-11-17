import type { UserRole } from "@open-tabletop/core";
import { useRef, useState } from "react";
import { removeCampaignMember, updateCampaignMember, type CampaignMemberInfo } from "./api.js";
import { errorMessage, titleCaseLabel } from "./sheet-format.js";

export type CampaignAssignableRole = Extract<UserRole, "gm" | "assistant_gm" | "player" | "observer">;

const assignableRoles: CampaignAssignableRole[] = ["gm", "assistant_gm", "player", "observer"];

export function filterCampaignMembers(members: CampaignMemberInfo[], search: string): CampaignMemberInfo[] {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  if (!normalizedSearch) return members;
  return members.filter((member) => [
    member.user.displayName,
    member.user.email ?? "",
    member.role,
    member.userId,
  ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch)));
}

export function campaignMemberManagementReason(member: CampaignMemberInfo, currentUserId: string, canManage: boolean): string | undefined {
  if (!canManage) return "You can view campaign members, but only an authorized campaign manager can change access.";
  if (member.role === "owner") return "Use campaign ownership transfer to change the protected owner role.";
  if (member.source?.type === "scim_group") return "This membership is managed by its SCIM group mapping.";
  if (member.userId === currentUserId) return "Manage your own campaign access from the account workflow to avoid locking yourself out.";
  return undefined;
}

export function CampaignMemberRemovalReview(props: { member: CampaignMemberInfo; busy: boolean; onConfirm(): void; onCancel(): void }) {
  return (
    <div className="operator-item admin-item" role="alertdialog" aria-label={`Remove ${props.member.user.displayName} from campaign`}>
      <h3>Remove {props.member.user.displayName}?</h3>
      <p>This immediately ends campaign access, removes direct permission grants, and releases this member&apos;s token ownership. Their user account and organization role are unchanged.</p>
      <div className="button-row">
        <button className="ghost-button danger-button" type="button" disabled={props.busy} onClick={props.onConfirm}>
          {props.busy ? "Removing..." : "Remove campaign member"}
        </button>
        <button className="ghost-button" type="button" disabled={props.busy} onClick={props.onCancel}>Keep member</button>
      </div>
    </div>
  );
}

export function CampaignMembersPanel(props: {
  campaignId: string;
  currentUserId: string;
  members: CampaignMemberInfo[];
  defaultSearch?: string;
  canManage: boolean;
  onMemberUpdated(member: CampaignMemberInfo): void;
  onMemberRemoved(memberId: string): void;
  onRefresh(): Promise<void>;
  onStatus(message: string): void;
}) {
  const [busyMemberId, setBusyMemberId] = useState("");
  const [pendingRemovalId, setPendingRemovalId] = useState("");
  const [failure, setFailure] = useState("");
  const [search, setSearch] = useState(props.defaultSearch ?? "");
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const pendingRemoval = props.members.find((member) => member.id === pendingRemovalId);
  const visibleMembers = filterCampaignMembers(props.members, search);

  const restoreRemoveFocus = (memberId: string) => {
    window.requestAnimationFrame(() => removeButtons.current.get(memberId)?.focus());
  };

  const changeRole = async (member: CampaignMemberInfo, role: CampaignAssignableRole) => {
    setBusyMemberId(member.id);
    setFailure("");
    try {
      const updated = await updateCampaignMember(props.campaignId, member, role, { idempotencyKey: `campaign-member-role:${window.crypto.randomUUID()}` });
      props.onMemberUpdated(updated);
      props.onStatus(`${updated.user.displayName} is now ${titleCaseLabel(updated.role)}`);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setBusyMemberId("");
    }
  };

  const confirmRemoval = async (member: CampaignMemberInfo) => {
    setBusyMemberId(member.id);
    setFailure("");
    try {
      await removeCampaignMember(props.campaignId, member, { idempotencyKey: `campaign-member-remove:${window.crypto.randomUUID()}` });
      props.onMemberRemoved(member.id);
      setPendingRemovalId("");
      props.onStatus(`${member.user.displayName} was removed from the campaign`);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setBusyMemberId("");
    }
  };

  return (
    <section className="operator-section" aria-label="Campaign members">
      <div className="operator-heading">
        <div>
          <div className="section-title">Campaign Members</div>
          <p>Roles control campaign, actor, scene, combat, and private-information access.</p>
        </div>
        <strong>{visibleMembers.length === props.members.length ? `${props.members.length} members` : `${visibleMembers.length} of ${props.members.length} members`}</strong>
      </div>
      <label>
        <span>Search members</span>
        <input aria-label="Search campaign members" value={search} placeholder="Name, email, role, or user ID" onChange={(event) => setSearch(event.target.value)} />
      </label>
      {failure && (
        <div className="error-state" role="alert">
          <span>{failure}</span>
          <button className="ghost-button small" type="button" onClick={() => void props.onRefresh().then(() => setFailure("")).catch((error) => setFailure(errorMessage(error)))}>Reload members</button>
        </div>
      )}
      {pendingRemoval && (
        <CampaignMemberRemovalReview
          member={pendingRemoval}
          busy={busyMemberId === pendingRemoval.id}
          onConfirm={() => void confirmRemoval(pendingRemoval)}
          onCancel={() => { setPendingRemovalId(""); restoreRemoveFocus(pendingRemoval.id); }}
        />
      )}
      {props.members.length === 0 ? <p className="empty-state">No campaign members are available.</p> : visibleMembers.length === 0 ? <p className="empty-state">No campaign members match this search.</p> : visibleMembers.map((member) => {
        const reason = campaignMemberManagementReason(member, props.currentUserId, props.canManage);
        const busy = busyMemberId === member.id;
        return (
          <article className="operator-item admin-item" key={member.id}>
            <div className="operator-row">
              <span className={`status-pill ${member.active ? "completed" : "idle"}`}>{member.active ? "active" : "offline"}</span>
              <strong>{titleCaseLabel(member.role)}{member.userId === props.currentUserId ? " (you)" : ""}</strong>
            </div>
            <h3>{member.user.displayName}</h3>
            <p>{member.user.email ?? "No email"} &middot; {member.permissions.length} effective permissions</p>
            {reason ? <p className="muted">{reason}</p> : (
              <div className="admin-actions">
                <label>
                  <span>Campaign role</span>
                  <select aria-label={`Campaign role for ${member.user.displayName}`} value={member.role} disabled={busy} onChange={(event) => void changeRole(member, event.target.value as CampaignAssignableRole)}>
                    {assignableRoles.map((role) => <option key={role} value={role}>{titleCaseLabel(role)}</option>)}
                  </select>
                </label>
                <button
                  ref={(button) => { if (button) removeButtons.current.set(member.id, button); else removeButtons.current.delete(member.id); }}
                  className="ghost-button danger-button"
                  type="button"
                  disabled={busy || Boolean(pendingRemoval)}
                  onClick={() => setPendingRemovalId(member.id)}
                >Review removal</button>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
