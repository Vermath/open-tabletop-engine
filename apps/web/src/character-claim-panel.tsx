import type { CharacterClaimOption, CharacterClaimResult } from "@open-tabletop/api-contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost, type Snapshot } from "./api.js";
import { errorMessage } from "./sheet-format.js";

export async function submitCharacterChoice(campaignId: string, option: CharacterClaimOption, managing: boolean, idempotencyKey: string, signal: AbortSignal) {
  const actorPath = `/api/v1/campaigns/${encodeURIComponent(campaignId)}/actors/${encodeURIComponent(option.actorId)}`;
  const options = { idempotencyKey, signal };
  if (managing) {
    await apiPost(actorPath + "/claim-offer", { expectedUpdatedAt: option.updatedAt, offered: !option.offered }, options);
    return undefined;
  }
  return apiPost<CharacterClaimResult>(actorPath + "/claim", { expectedUpdatedAt: option.updatedAt }, options);
}

export function CharacterClaimPanel(props: {
  campaignId: string;
  managing?: boolean;
  snapshot: Pick<Snapshot, "actors" | "scenes" | "tokens">;
  onChoose(option: CharacterClaimOption, idempotencyKey: string): Promise<void>;
}) {
  const { actors, tokens, scenes } = props.snapshot;
  const rosterRevision = useMemo(() => JSON.stringify([
    actors.filter((actor) => actor.type === "character").map((actor) => [actor.id, actor.updatedAt]),
    tokens.filter((token) => token.actorId).map((token) => [token.actorId, token.sceneId, token.hidden, token.layer, token.ownerUserIds]),
    scenes.find((scene) => scene.active)?.id
  ]), [actors, tokens, scenes]);
  const [options, setOptions] = useState<CharacterClaimOption[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const attempt = useRef<{ fingerprint: string; key: string } | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    apiGet<CharacterClaimOption[]>(`/api/v1/campaigns/${encodeURIComponent(props.campaignId)}/character-claims`, { signal: controller.signal })
      .then((next) => { if (!controller.signal.aborted) setOptions(next); })
      .catch((failure) => { if (!controller.signal.aborted) setError(errorMessage(failure)); });
    return () => controller.abort();
  }, [props.campaignId, rosterRevision, reload]);

  async function choose(option: CharacterClaimOption) {
    const fingerprint = JSON.stringify([option.actorId, option.updatedAt, option.offered]);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      await props.onChoose(option, attempt.current.key);
      attempt.current = undefined;
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
      setReload((value) => value + 1);
    }
  }

  const title = props.managing ? "Offer player characters" : "Choose your character";
  return (
    <section className={props.managing ? "account-box character-claim-panel" : "character-claim-panel claim-at-table"} aria-label={title}>
      <h3>{title}</h3>
      {options?.length ? options.map((option) => {
        const action = props.managing ? option.offered ? "Withdraw" : "Offer" : "Claim";
        return <button key={option.actorId} type="button" className={props.managing ? "ghost-button small" : "primary-button"} disabled={busy} onClick={() => void choose(option)}>{action} {option.name}</button>;
      }) : <p>{options ? props.managing ? "Place a token on the active scene for an unassigned character or one you own." : "Your GM can offer you a character from the People panel." : "Loading characters..."}</p>}
      {error && <p role="alert">{error} <button className="ghost-button small" type="button" onClick={() => { setError(""); setReload((value) => value + 1); }}>Refresh choices</button></p>}
    </section>
  );
}
