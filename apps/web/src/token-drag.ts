import type { Item, Token, TokenLayer } from "@open-tabletop/core";


export interface TokenDropPayload {
  type: "actor" | "asset";
  id: string;
  name: string;
  actorId?: string;
  imageAssetId?: string;
  disposition?: Token["disposition"];
  layer?: TokenLayer;
}

export const tokenDropMime = "application/x-open-tabletop-token";

export const itemDropMime = "application/x-open-tabletop-item";


export function writeTokenDropData(dataTransfer: DataTransfer, payload: TokenDropPayload): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(tokenDropMime, JSON.stringify(payload));
  dataTransfer.setData("text/plain", payload.name);
}


export function setTokenDropPreview(dataTransfer: DataTransfer, label: string, imageUrl?: string): void {
  const preview = document.createElement("div");
  preview.className = "token-drag-preview";
  if (imageUrl) {
    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = "";
    preview.appendChild(image);
  }
  const text = document.createElement("span");
  text.textContent = label;
  preview.appendChild(text);
  document.body.appendChild(preview);
  dataTransfer.setDragImage(preview, 42, 42);
  window.setTimeout(() => preview.remove(), 0);
}


export function readTokenDropData(dataTransfer: DataTransfer): TokenDropPayload | undefined {
  const raw = dataTransfer.getData(tokenDropMime);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<TokenDropPayload>;
    if ((parsed.type !== "actor" && parsed.type !== "asset") || typeof parsed.id !== "string" || typeof parsed.name !== "string") return undefined;
    return {
      type: parsed.type,
      id: parsed.id,
      name: parsed.name,
      actorId: typeof parsed.actorId === "string" ? parsed.actorId : undefined,
      imageAssetId: typeof parsed.imageAssetId === "string" ? parsed.imageAssetId : undefined,
      layer: parsed.layer === "map" || parsed.layer === "player" || parsed.layer === "gm" ? parsed.layer : undefined,
      disposition: parsed.disposition === "friendly" || parsed.disposition === "neutral" || parsed.disposition === "hostile" ? parsed.disposition : undefined
    };
  } catch {
    return undefined;
  }
}


export function hasTokenDropData(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(tokenDropMime);
}


export function writeItemDropData(dataTransfer: DataTransfer, item: Item): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(itemDropMime, item.id);
  dataTransfer.setData("text/plain", item.name);
  setTokenDropPreview(dataTransfer, item.name);
}


export function readItemDropData(dataTransfer: DataTransfer): string | undefined {
  const itemId = dataTransfer.getData(itemDropMime);
  return itemId || undefined;
}


export function hasItemDropData(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(itemDropMime);
}
