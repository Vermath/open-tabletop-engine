import type { LightSource, VisionPoint, Wall } from "./types.js";

/** Checked before image allocation or polyline expansion. */
export const UNIVERSAL_VTT_LIMITS = {
  documentBytes: 8 * 1024 * 1024,
  documentCharacters: 8 * 1024 * 1024,
  imageBytes: 6 * 1024 * 1024,
  dimension: 32768,
  imagePixels: 40_000_000,
  gridSize: 4096,
  wallSegments: 20_000,
  portals: 2_000,
  lights: 1_000,
  coordinate: 1_000_000
} as const;

export interface UniversalVttImage {
  dataBase64: string;
  contentType: "image/png" | "image/webp";
  width: number;
  height: number;
  byteLength: number;
}

/** A deterministic import plan. Persistence assigns IDs after authorization. */
export interface UniversalVttPlan {
  format: 0.2 | 0.3;
  width: number;
  height: number;
  gridSize: number;
  gridOrigin?: VisionPoint;
  image: UniversalVttImage;
  walls: Array<Omit<Wall, "id">>;
  lights: Array<Omit<LightSource, "id">>;
  provenance: { software?: string; creator?: string };
  warnings: string[];
}

export class UniversalVttError extends Error {
  constructor(public readonly path: string, reason: string) {
    super(path + ": " + reason);
    this.name = "UniversalVttError";
  }
}

/**
 * Parses classic JSON .uvtt/.dd2vtt/.df2vtt, not the UVTT 2 ZIP draft.
 * Source: https://arkenforge.com/universal-vtt-files/ (developer information).
 * Geometry is in grid squares relative to the original uncropped map.
 * This validates image containers; a raster decoder must also verify compressed
 * pixels before persistence. No IDs are allocated or external resources read.
 */
export function parseUniversalVtt(input: unknown): UniversalVttPlan {
  if (typeof input === "string") {
    if (input.length > UNIVERSAL_VTT_LIMITS.documentCharacters || new TextEncoder().encode(input).byteLength > UNIVERSAL_VTT_LIMITS.documentBytes) fail("document", "exceeds the 8 MiB UTF-8 text limit");
    try { input = JSON.parse(input); } catch { fail("document", "must contain valid Universal VTT JSON"); }
  }
  const document = record(input, "document");
  if (document.format !== 0.2 && document.format !== 0.3) fail("format", "only classic Universal VTT versions 0.2 and 0.3 are supported");
  const format = document.format;
  const resolution = record(document.resolution, "resolution");
  const origin = point(resolution.map_origin, "resolution.map_origin");
  const size = point(resolution.map_size, "resolution.map_size");
  const gridSize = number(resolution.pixels_per_grid, "resolution.pixels_per_grid", 1, UNIVERSAL_VTT_LIMITS.gridSize);
  if (!Number.isInteger(gridSize)) fail("resolution.pixels_per_grid", "must be a whole number of pixels");
  if (size.x <= 0 || size.y <= 0) fail("resolution.map_size", "both dimensions must be positive");
  const width = Math.round(size.x * gridSize);
  const height = Math.round(size.y * gridSize);
  validateDimensions(width, height, "resolution.map_size");
  const image = parseImage(document.image);
  if (image.width !== width || image.height !== height) fail("image", "pixel dimensions must match map_size multiplied by pixels_per_grid");
  const warnings = new Set<string>();
  const warnUnknown = (value: Record<string, unknown>, fields: string[]) => {
    if (Object.keys(value).some((key) => !fields.includes(key))) warnings.add("Exporter-specific fields are not imported.");
  };
  warnUnknown(resolution, ["map_origin", "map_size", "pixels_per_grid"]);
  const walls: UniversalVttPlan["walls"] = [];
  let segmentCount = 0;
  const toPixels = (value: unknown, path: string): VisionPoint => {
    const source = point(value, path);
    const result = { x: (source.x - origin.x) * gridSize, y: (source.y - origin.y) * gridSize };
    if (Math.abs(result.x) > UNIVERSAL_VTT_LIMITS.coordinate || Math.abs(result.y) > UNIVERSAL_VTT_LIMITS.coordinate) fail(path, "transformed point exceeds coordinate bounds");
    return result;
  };
  const addSegment = (a: VisionPoint, b: VisionPoint, path: string, properties: Pick<Wall, "kind" | "open" | "blocksVision" | "blocksMovement">) => {
    if (++segmentCount > UNIVERSAL_VTT_LIMITS.wallSegments) fail(path, "exceeds the 20000 wall segment limit");
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.000001) fail(path, "zero-length wall segments are invalid");
    // Exporters may retain geometry beyond a cropped image. Clip its perimeter.
    const clipped = clipSegment(a, b, width, height);
    if (!clipped) { warnings.add("Geometry outside the cropped map was omitted."); return; }
    if (clipped.a.x !== a.x || clipped.a.y !== a.y || clipped.b.x !== b.x || clipped.b.y !== b.y) warnings.add("Geometry crossing the cropped map boundary was clipped.");
    walls.push({ x1: clipped.a.x, y1: clipped.a.y, x2: clipped.b.x, y2: clipped.b.y, ...properties });
  };
  for (const field of ["line_of_sight", "objects_line_of_sight"] as const) {
    array(document[field], field, UNIVERSAL_VTT_LIMITS.wallSegments).forEach((line, lineIndex) => {
      const path = field + "[" + lineIndex + "]";
      const vertices = array(line, path, UNIVERSAL_VTT_LIMITS.wallSegments + 1);
      if (vertices.length < 2) fail(path, "requires at least two points");
      // A closed perimeter repeats its first point. Do not seal deliberate gaps.
      let previous = toPixels(vertices[0], path + "[0]");
      for (let index = 1; index < vertices.length; index++) {
        const next = toPixels(vertices[index], path + "[" + index + "]");
        addSegment(previous, next, path, { kind: "wall", blocksVision: true, blocksMovement: true });
        previous = next;
      }
    });
  }
  array(document.portals, "portals", UNIVERSAL_VTT_LIMITS.portals).forEach((value, index) => {
    const path = "portals[" + index + "]";
    const portal = record(value, path);
    warnUnknown(portal, ["position", "bounds", "rotation", "closed", "freestanding"]);
    const bounds = array(portal.bounds, path + ".bounds", 2);
    if (bounds.length !== 2) fail(path + ".bounds", "requires exactly two endpoints");
    const closed = boolean(portal.closed, path + ".closed");
    if (portal.position !== undefined) toPixels(portal.position, path + ".position");
    if (portal.rotation !== undefined) number(portal.rotation, path + ".rotation", -1_000_000, 1_000_000);
    if (portal.freestanding !== undefined) boolean(portal.freestanding, path + ".freestanding");
    if (!closed) warnings.add("Open portals are imported as open doors. Some exporters also use these for windows; review their movement blocking after import.");
    addSegment(toPixels(bounds[0], path + ".bounds[0]"), toPixels(bounds[1], path + ".bounds[1]"), path, { kind: "door", open: !closed, blocksVision: closed, blocksMovement: closed });
  });
  const lights: UniversalVttPlan["lights"] = [];
  array(document.lights, "lights", UNIVERSAL_VTT_LIMITS.lights).forEach((value, index) => {
    const path = "lights[" + index + "]";
    const light = record(value, path);
    warnUnknown(light, ["position", "range", "intensity", "color", "shadows"]);
    const position = toPixels(light.position, path + ".position");
    const range = number(light.range, path + ".range", 0, UNIVERSAL_VTT_LIMITS.coordinate / gridSize);
    const originalIntensity = light.intensity === undefined ? 1 : number(light.intensity, path + ".intensity", 0, 100);
    const intensity = Math.min(1, originalIntensity);
    if (originalIntensity > 1) warnings.add("Light intensity above 1 was capped at the engine maximum of 1.");
    const color = light.color === undefined ? "#ffffff" : parseColor(light.color, path + ".color");
    const shadows = light.shadows === undefined ? true : boolean(light.shadows, path + ".shadows");
    lights.push({ ...position, radius: range * gridSize, color, intensity, shadows });
  });
  if (document.environment !== undefined) {
    const environment = record(document.environment, "environment");
    warnUnknown(environment, ["baked_lighting", "ambient_light"]);
    if (environment.baked_lighting !== undefined && boolean(environment.baked_lighting, "environment.baked_lighting")) warnings.add("Lighting is baked into the background image. Imported light overlays may make it brighter than the original.");
    if (environment.ambient_light !== undefined) {
      parseColor(environment.ambient_light, "environment.ambient_light");
      warnings.add("The source ambient light color is not applied; the background image and individual lights are preserved.");
    }
  }
  const knownFields = new Set(["format", "resolution", "line_of_sight", "objects_line_of_sight", "portals", "environment", "lights", "image", "software", "creator"]);
  if (Object.keys(document).some((key) => !knownFields.has(key))) warnings.add("Exporter-specific fields are not imported.");
  const provenance: UniversalVttPlan["provenance"] = {};
  for (const key of ["software", "creator"] as const) {
    if (document[key] !== undefined) {
      if (typeof document[key] === "string" && document[key].length <= 512) provenance[key] = document[key];
      else warnings.add("Unsupported source attribution was omitted; software and creator must be short strings.");
    }
  }
  const offset = (coordinate: number) => {
    const result = ((-coordinate * gridSize) % gridSize + gridSize) % gridSize;
    return Math.abs(result) < 0.000001 || Math.abs(result - gridSize) < 0.000001 ? 0 : result;
  };
  const gridOrigin = { x: offset(origin.x), y: offset(origin.y) };
  return { format, width, height, gridSize, ...(gridOrigin.x || gridOrigin.y ? { gridOrigin } : {}), image, walls, lights, provenance, warnings: [...warnings] };
}

function fail(path: string, reason: string): never { throw new UniversalVttError(path, reason); }
function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  return value as Record<string, unknown>;
}
function array(value: unknown, path: string, maximum: number): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(path, "must be an array");
  if (value.length > maximum) fail(path, "exceeds the " + maximum + " entry limit");
  return value;
}
function number(value: unknown, path: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) fail(path, "must be a finite number from " + minimum + " to " + maximum);
  return value;
}
function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "must be a boolean");
  return value;
}
function point(value: unknown, path: string): VisionPoint {
  const data = record(value, path);
  return { x: number(data.x, path + ".x", -UNIVERSAL_VTT_LIMITS.coordinate, UNIVERSAL_VTT_LIMITS.coordinate), y: number(data.y, path + ".y", -UNIVERSAL_VTT_LIMITS.coordinate, UNIVERSAL_VTT_LIMITS.coordinate) };
}
function validateDimensions(width: number, height: number, path: string): void {
  if (width < 1 || height < 1 || width > UNIVERSAL_VTT_LIMITS.dimension || height > UNIVERSAL_VTT_LIMITS.dimension || width * height > UNIVERSAL_VTT_LIMITS.imagePixels) fail(path, "dimensions must be positive, at most 32768 pixels per side, and at most 40 million pixels");
}
function parseColor(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^#?(?:[\da-f]{6}|[\da-f]{8})$/i.test(value)) fail(path, "must be a six-digit RGB or eight-digit ARGB hexadecimal color");
  const hex = value.replace(/^#/, "").toLowerCase();
  // UVTT uses ARGB, unlike CSS. Corroborated by the original importer:
  // https://github.com/shdwjk/Roll20API/tree/master/UniversalVTTImporter
  return "#" + (hex.length === 8 ? hex.slice(2) + hex.slice(0, 2) : hex);
}
function clipSegment(a: VisionPoint, b: VisionPoint, width: number, height: number): { a: VisionPoint; b: VisionPoint } | undefined {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let start = 0;
  let end = 1;
  for (const [p, q] of [[-dx, a.x], [dx, width - a.x], [-dy, a.y], [dy, height - a.y]] as const) {
    if (p === 0) { if (q < 0) return undefined; }
    else if (p < 0) start = Math.max(start, q / p);
    else end = Math.min(end, q / p);
    if (start >= end) return undefined;
  }
  return { a: { x: a.x + start * dx, y: a.y + start * dy }, b: { x: a.x + end * dx, y: a.y + end * dy } };
}

function parseImage(value: unknown): UniversalVttImage {
  if (typeof value !== "string" || value.length === 0 || value.length > 4 * Math.ceil(UNIVERSAL_VTT_LIMITS.imageBytes / 3)) fail("image", "requires an embedded PNG or WebP no larger than 6 MiB");
  // Validate before allocation; atob alone accepts noncanonical padding/whitespace.
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail("image", "must be canonical base64 without a data URL or external URL");
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  if ((padding === 2 && (alphabet.indexOf(value[value.length - 3]!) & 15) !== 0) || (padding === 1 && (alphabet.indexOf(value[value.length - 2]!) & 3) !== 0)) fail("image", "contains invalid base64 padding bits");
  const byteLength = value.length / 4 * 3 - padding;
  if (byteLength > UNIVERSAL_VTT_LIMITS.imageBytes) fail("image", "exceeds the 6 MiB decoded image limit");
  const bytes = new Uint8Array(byteLength);
  let destination = 0;
  for (let index = 0; index < value.length; index += 4) {
    const word = (alphabet.indexOf(value[index]!) << 18) | (alphabet.indexOf(value[index + 1]!) << 12) | (Math.max(0, alphabet.indexOf(value[index + 2]!)) << 6) | Math.max(0, alphabet.indexOf(value[index + 3]!));
    if (destination < byteLength) bytes[destination++] = word >> 16;
    if (destination < byteLength) bytes[destination++] = word >> 8;
    if (destination < byteLength) bytes[destination++] = word;
  }
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const dimensions = png ? pngDimensions(bytes) : webpDimensions(bytes);
  validateDimensions(dimensions.width, dimensions.height, "image");
  return { dataBase64: value, contentType: png ? "image/png" : "image/webp", ...dimensions, byteLength };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc(bytes: Uint8Array, start: number, end: number): number {
  let value = 0xffffffff;
  for (let index = start; index < end; index++) value = CRC_TABLE[(value ^ bytes[index]!) & 255]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function fourCC(bytes: Uint8Array, offset: number): string { return String.fromCharCode(...bytes.subarray(offset, offset + 4)); }
function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let imageBytes = 0;
  let endedImageData = false;
  let palette = false;
  let colorType = 0;
  let chunks = 0;
  while (offset + 12 <= bytes.length) {
    if (++chunks > 100_000) fail("image", "contains too many PNG chunks");
    const length = view.getUint32(offset);
    const type = fourCC(bytes, offset + 4);
    const end = offset + 8 + length;
    if (end + 4 > bytes.length || !/^[A-Za-z]{4}$/.test(type) || crc(bytes, offset + 4, end) !== view.getUint32(end)) fail("image", "contains a truncated or corrupt PNG chunk");
    if (offset === 8 && type !== "IHDR") fail("image", "PNG must start with IHDR");
    if (type === "IHDR") {
      if (offset !== 8 || length !== 13) fail("image", "contains an invalid PNG header");
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      validateDimensions(width, height, "image");
      const depth = bytes[offset + 16]!;
      colorType = bytes[offset + 17]!;
      const validDepths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!validDepths[colorType]?.includes(depth) || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20]! > 1) fail("image", "contains unsupported PNG encoding values");
    } else if (type === "PLTE") {
      if (palette || imageBytes || length === 0 || length > 768 || length % 3 !== 0 || colorType === 0 || colorType === 4) fail("image", "contains an invalid PNG palette");
      palette = true;
    } else if (type === "IDAT") {
      if (endedImageData || (colorType === 3 && !palette)) fail("image", "contains invalid PNG image data ordering");
      imageBytes += length;
    } else if (type === "IEND") {
      if (length || imageBytes < 6 || end + 4 !== bytes.length) fail("image", "contains incomplete PNG image data or trailing bytes");
      return { width, height };
    } else {
      if (type === "acTL" || type === "fcTL" || type === "fdAT") fail("image", "animated PNG maps are not supported");
      if (type[0] === type[0]!.toUpperCase()) fail("image", "contains an unsupported critical PNG chunk");
      if (imageBytes) endedImageData = true;
    }
    offset = end + 4;
  }
  fail("image", "contains a truncated PNG or missing IEND");
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 30 || fourCC(bytes, 0) !== "RIFF" || fourCC(bytes, 8) !== "WEBP") fail("image", "must contain a PNG or WebP image");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) + 8 !== bytes.length) fail("image", "contains an invalid WebP file length");
  let dimensions: { width: number; height: number } | undefined;
  let bitstreamDimensions: typeof dimensions;
  let offset = 12;
  let chunks = 0;
  while (offset + 8 <= bytes.length) {
    if (++chunks > 100_000) fail("image", "contains too many WebP chunks");
    const type = fourCC(bytes, offset);
    const length = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + length;
    if (end + (length % 2) > bytes.length || (length % 2 && bytes[end] !== 0)) fail("image", "contains a truncated or invalid WebP chunk");
    if (type === "ANIM" || type === "ANMF") fail("image", "animated WebP maps are not supported");
    if (type === "VP8X") {
      if (offset !== 12 || length !== 10 || (bytes[start]! & 0xc3) !== 0 || bytes[start + 1] || bytes[start + 2] || bytes[start + 3]) fail("image", "contains an invalid or animated WebP extended header");
      const uint24 = (at: number) => bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16);
      dimensions = { width: 1 + uint24(start + 4), height: 1 + uint24(start + 7) };
      validateDimensions(dimensions.width, dimensions.height, "image");
    }
    if (type === "VP8 " || type === "VP8L") {
      if (bitstreamDimensions || (!dimensions && offset !== 12)) fail("image", "contains invalid WebP image data ordering");
      if (type === "VP8 ") {
        if (length < 10 || (bytes[start]! & 1) !== 0 || bytes[start + 3] !== 0x9d || bytes[start + 4] !== 1 || bytes[start + 5] !== 0x2a) fail("image", "contains an invalid WebP lossy frame");
        bitstreamDimensions = { width: view.getUint16(start + 6, true) & 0x3fff, height: view.getUint16(start + 8, true) & 0x3fff };
      } else {
        if (length < 6 || bytes[start] !== 0x2f || (bytes[start + 4]! & 0xe0) !== 0) fail("image", "contains an invalid WebP lossless frame");
        const bits = view.getUint32(start + 1, true);
        bitstreamDimensions = { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
      }
      if (dimensions && (dimensions.width !== bitstreamDimensions.width || dimensions.height !== bitstreamDimensions.height)) fail("image", "WebP canvas and image dimensions differ");
      dimensions = bitstreamDimensions;
    }
    offset = end + (length % 2);
  }
  if (offset !== bytes.length || !dimensions || !bitstreamDimensions) fail("image", "contains incomplete WebP image data");
  return dimensions;
}
