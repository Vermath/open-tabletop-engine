import type { JournalEntry, MapAsset, Scene, SceneMapPin, VisionPoint } from "@open-tabletop/core";
import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HandoutAssetGallery, type HandoutLibraryItem } from "./handout-library-panel.js";
import { MarkdownDocument } from "./markdown-document.js";
import type { Snapshot } from "./api.js";
import { PresentToPlayers } from "./presentation.js";
import type { PinTarget } from "./scene-pin-drag.js";
import { errorMessage } from "./sheet-format.js";
import "./scene-map-pins.css";

export interface ScenePinProps {
  pinJournals?: JournalEntry[];
  presentationMembers?: Snapshot["members"];
  canPresentPin?(targetType: PinTarget["targetType"]): boolean;
  pinHandouts?: HandoutLibraryItem[];
  onSavePin?(scene: Scene, command: SceneMapPin | { remove: string }): Promise<void>;
}

export type PinSelection = { kind: "open"; id: string } | { kind: "add"; target?: PinTarget; point?: VisionPoint };
type Entry = PinTarget & { title: string; body: string; updatedAt: string; assetIds?: string[] };

export function ScenePinMarkers({ scene, onOpen }: { scene: Scene; onOpen?: (id: string) => void }) {
  return <>{scene.mapPins?.map((pin) => {
    const style = { left: `${100 * pin.x / scene.width}%`, top: `${100 * pin.y / scene.height}%` };
    return onOpen ? <button type="button" className="scene-lore-pin" key={pin.id} style={style} aria-label={`Open map pin ${pin.label}`}
      onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => { event.stopPropagation(); onOpen(pin.id); }}><MapPin size={14} />{pin.label}</button>
      : <span className="scene-lore-pin" key={pin.id} style={style}>{pin.label}</span>;
  })}</>;
}

export function ScenePinDialog(props: ScenePinProps & { scene: Scene; assets: MapAsset[]; selection: PinSelection; onClose(): void }) {
  const entries: Entry[] = [
    ...(props.pinJournals ?? []).filter((entry) => entry.kind !== "folder").map((entry): Entry => ({ targetType: "journal", targetId: entry.id, title: entry.title, body: entry.body, updatedAt: entry.updatedAt })),
    ...(props.pinHandouts ?? []).map((entry): Entry => ({ targetType: "handout", targetId: entry.id, title: entry.title, body: entry.body, updatedAt: entry.updatedAt, assetIds: entry.assetIds })),
  ];
  const selection = props.selection;
  const pin = selection.kind === "open" ? props.scene.mapPins?.find((item) => item.id === selection.id) : undefined;
  const target = pin ?? (selection.kind === "add" ? selection.target : undefined);
  const entry = entries.find((item) => item.targetType === target?.targetType && item.targetId === target.targetId);
  const [editing, setEditing] = useState(selection.kind === "add");
  const dialog = useRef<HTMLDialogElement>(null);
  const available = selection.kind === "open" ? Boolean(pin && entry) : Boolean(props.onSavePin && (!target || entry));
  useEffect(() => {
    if (!available) { props.onClose(); return; }
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, [available]);
  if (!available) return null;
  return <dialog ref={dialog} className="scene-pin-dialog" aria-label={editing ? "Edit map pin" : "Linked entry"} onCancel={props.onClose}>
    <div className="lore-editor-title"><strong>{editing ? (pin ? "Edit map pin" : "Place map pin") : pin?.label}</strong>
      <button type="button" className="ghost-button small" onClick={props.onClose}>Close</button></div>
    {editing && props.onSavePin ? <PinForm scene={props.scene} entries={entries} pin={pin} target={entry} point={selection.kind === "add" ? selection.point : undefined} onSave={props.onSavePin} onClose={props.onClose} />
      : entry && <><h3>{entry.title}</h3><MarkdownDocument source={entry.body} label={entry.title} />
        {entry.assetIds && <HandoutAssetGallery assets={props.assets.filter((asset) => entry.assetIds!.includes(asset.id))} />}
        {pin && props.presentationMembers && props.canPresentPin?.(entry.targetType) && <PresentToPlayers key={pin.id} campaignId={props.scene.campaignId} members={props.presentationMembers}
          target={{ targetType: entry.targetType, targetId: entry.targetId, expectedUpdatedAt: entry.updatedAt, pinId: pin.id, sceneId: props.scene.id }} />}
        {props.onSavePin && <button type="button" className="ghost-button" onClick={() => setEditing(true)}>Edit map pin</button>}</>}
  </dialog>;
}

function PinForm({ scene, entries, pin, target, point, onSave, onClose }: {
  scene: Scene; entries: Entry[]; pin?: SceneMapPin; target?: Entry; point?: VisionPoint;
  onSave: NonNullable<ScenePinProps["onSavePin"]>; onClose(): void;
}) {
  const [baseScene] = useState(scene);
  const [id] = useState(() => pin?.id ?? crypto.randomUUID());
  const targetKey = (item: PinTarget) => JSON.stringify([item.targetType, item.targetId]);
  const [selected, setSelected] = useState(target ? targetKey(target) : "");
  const [label, setLabel] = useState(pin?.label ?? "");
  const [audience, setAudience] = useState<SceneMapPin["audience"]>(pin?.audience ?? "gm");
  const [x, setX] = useState(String(pin?.x ?? Math.round(point?.x ?? scene.width / 2)));
  const [y, setY] = useState(String(pin?.y ?? Math.round(point?.y ?? scene.height / 2)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(command: SceneMapPin | { remove: string }) {
    if (busy) return;
    setBusy(true);
    try { await onSave(baseScene, command); onClose(); }
    catch (reason) { setError(errorMessage(reason)); setBusy(false); }
  }
  const entry = entries.find((item) => targetKey(item) === selected);
  return <form className="lore-editor" onSubmit={(event) => {
    event.preventDefault();
    if (entry) void save({ id, label: label.trim(), audience, targetType: entry.targetType, targetId: entry.targetId, x: Number(x), y: Number(y) });
  }}>
    <label>Linked entry<select required value={selected} onChange={(event) => setSelected(event.target.value)}>
      <option value="">Choose an entry</option>{entries.map((item) => <option key={targetKey(item)} value={targetKey(item)}>{item.title} ({item.targetType})</option>)}
    </select></label>
    <label>Pin label<input required maxLength={40} placeholder="A3" value={label} onChange={(event) => setLabel(event.target.value)} /></label>
    <div className="lore-filter-grid"><label>X coordinate<input required type="number" step="any" min={0} max={scene.width} value={x} onChange={(event) => setX(event.target.value)} /></label>
      <label>Y coordinate<input required type="number" step="any" min={0} max={scene.height} value={y} onChange={(event) => setY(event.target.value)} /></label></div>
    <label>Pin audience<select value={audience} onChange={(event) => setAudience(event.target.value as SceneMapPin["audience"])}>
      <option value="gm">GM only</option><option value="readers">Readers of the linked entry</option></select></label>
    {error && <p role="alert">{error} Close and reopen the pin to load its latest position.</p>}
    <div className="button-row"><button className="primary-button" type="submit" disabled={busy || !entry || !label.trim()}>Save pin</button>
      {pin && <button className="ghost-button" type="button" disabled={busy} onClick={() => void save({ remove: pin.id })}>Remove pin</button>}</div>
  </form>;
}
