import { describe, expect, it } from "vitest";
import { parseUniversalVtt, UNIVERSAL_VTT_LIMITS, UniversalVttError } from "./universal-vtt.js";

// Original solid-blue pixels generated for these tests; no third-party map art.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPQCKj4DwADhAHwaWoWWwAAAABJRU5ErkJggg==";
const PNG_100 = "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAABj0lEQVR4nO3YsRGEQBDEQMLZcBQO2fNZvMaQMT6lPpx9jvdr70yDx/6A9gZyww+hPwQfIRD88IHgxw4EP3Ag+FEDwQ8ZCH68QPCDBYIfKRD8MIEMxLiBdTrBRwgEP3wg+LEDwQ8cCH7UQPBDBoIfLxD8YIHgRwoEP0wgAzFuYJ1O8BECwQ8fCH7sQPADB4IfNRD8kIHgxwsEP1gg+JECwQ8TyECMG1inE3yEQPDDB4IfOxD8wIHgRw0EP2Qg+PECwQ8WCH6kQPDDBDIQ4wbW6QQfIRD88IHgxw4EP3Ag+FEDwQ8ZCH68QPCDBYIfKRD8MIEMxLiBdTrBRwgEP3wg+LEDwQ8cCH7UQPBDBoIfLxD8YIHgRwoEP0wgAzFuYJ1O8BECwQ8fCH7sQPADB4IfNRD8kIHgxwsEP1gg+JECwQ8TyECMG1inE3yEQPDDB4IfOxD8wIHgRw0EP2Qg+PECwQ8WCH6kQPDDBDIQ4wbW6QQfIRD88IHgxw4EP3Ag+FEDwQ8ZCH68QPCDBYIf6Z/7AbQJjFbTZAOvAAAAAElFTkSuQmCC";
const WEBP_LOSSLESS = "UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAdQqKIUr/+BiOh/AAA=";
const WEBP_LOSSY = "UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoBAAEAAUAmJZACdLoAA5gA/vSIh/VcnYnxw/ubHOLZDAAA";
const fixture = () => ({
  format: 0.3,
  resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 1, y: 1 }, pixels_per_grid: 100 },
  image: PNG_100
});
const portal = (closed: boolean) => ({ position: { x: 0.5, y: 0.5 }, bounds: [{ x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }], rotation: 0, closed, freestanding: false });
const light = () => ({ position: { x: 0.5, y: 0.25 }, range: 2.5, intensity: 0.35, color: "80ff8040", shadows: false });
const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

describe("classic Universal VTT import plan", () => {
  it.each([0.2, 0.3])("accepts classic format %s as a deterministic id-free plan", (format) => {
    const input = { ...fixture(), format, software: "Test Cartographer", creator: "Original fixture" };
    const before = structuredClone(input);
    const result = parseUniversalVtt(JSON.stringify(input));
    expect(result).toMatchObject({ format, width: 100, height: 100, gridSize: 100, walls: [], lights: [], warnings: [], provenance: { software: input.software, creator: input.creator }, image: { dataBase64: PNG_100, width: 100, height: 100, contentType: "image/png" } });
    expect(result).not.toHaveProperty("gridOrigin");
    expect(parseUniversalVtt(input)).toEqual(result);
    expect(input).toEqual(before);
    expect(result).not.toHaveProperty("id");
  });

  it("subtracts a nonzero fractional crop from walls, portals and lights, preserving the grid phase", () => {
    const input = { ...fixture(), resolution: { ...fixture().resolution, map_origin: { x: 4.25, y: 6.5 } }, line_of_sight: [[{ x: 4.25, y: 6.5 }, { x: 5.25, y: 6.5 }]], portals: [{ ...portal(true), position: { x: 4.75, y: 7 }, bounds: [{ x: 4.5, y: 7 }, { x: 5, y: 7 }] }], lights: [{ ...light(), position: { x: 4.75, y: 6.75 } }] };
    const result = parseUniversalVtt(input);
    expect(result.gridOrigin).toEqual({ x: 75, y: 50 });
    expect(result.walls[0]).toMatchObject({ x1: 0, y1: 0, x2: 100, y2: 0 });
    expect(result.walls[1]).toMatchObject({ x1: 25, y1: 50, x2: 75, y2: 50 });
    expect(result.lights[0]).toMatchObject({ x: 50, y: 25, radius: 250 });
  });

  it("handles negative crop origin and fractional map size without rescaling the grid", () => {
    const result = parseUniversalVtt({ ...fixture(), resolution: { map_origin: { x: -2.25, y: -3 }, map_size: { x: 1.25, y: 1.25 }, pixels_per_grid: 80 } });
    expect(result).toMatchObject({ width: 100, height: 100, gridSize: 80, gridOrigin: { x: 20, y: 0 } });
  });

  it("keeps polylines open and imports object occluders as explicit segments", () => {
    const result = parseUniversalVtt({ ...fixture(), line_of_sight: [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]], objects_line_of_sight: [[{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.2 }]] });
    expect(result.walls).toHaveLength(3);
    expect(result.walls[2]).toMatchObject({ kind: "wall", x1: 20, x2: 40, blocksVision: true, blocksMovement: true });
    expect(result.walls.every((wall) => !("id" in wall))).toBe(true);
  });

  it("preserves closed and open portals without silently converting openings into blocking windows", () => {
    const result = parseUniversalVtt({ ...fixture(), portals: [portal(true), portal(false)] });
    expect(result.walls[0]).toMatchObject({ kind: "door", open: false, blocksVision: true, blocksMovement: true });
    expect(result.walls[1]).toMatchObject({ kind: "door", open: true, blocksVision: false, blocksMovement: false });
    expect(result.warnings).toContain("Open portals are imported as open doors. Some exporters also use these for windows; review their movement blocking after import.");
  });

  it("clips geometry across the cropped image and reports fully external segments", () => {
    const result = parseUniversalVtt({ ...fixture(), line_of_sight: [[{ x: -0.5, y: 0.5 }, { x: 1.5, y: 0.5 }], [{ x: -2, y: -2 }, { x: -1, y: -1 }]] });
    expect(result.walls).toEqual([{ x1: 0, y1: 50, x2: 100, y2: 50, kind: "wall", blocksVision: true, blocksMovement: true }]);
    expect(result.warnings).toContain("Geometry crossing the cropped map boundary was clipped.");
    expect(result.warnings).toContain("Geometry outside the cropped map was omitted.");
  });

  it("preserves light radius, intensity, ARGB alpha and shadow behavior", () => {
    expect(parseUniversalVtt({ ...fixture(), lights: [light(), { ...light(), color: "#123456", shadows: true, intensity: 0 }] }).lights).toEqual([
      { x: 50, y: 25, radius: 250, color: "#ff804080", intensity: 0.35, shadows: false },
      { x: 50, y: 25, radius: 250, color: "#123456", intensity: 0, shadows: true }
    ]);
  });

  it("reports baked/ambient lighting, capped intensity and unsupported exporter semantics", () => {
    const result = parseUniversalVtt({ ...fixture(), creator: { name: "Extension" }, lights: [{ ...light(), intensity: 4, falloff: 2 }], environment: { baked_lighting: true, ambient_light: "ff202020" } });
    expect(result.lights[0]?.intensity).toBe(1);
    expect(result.provenance).toEqual({});
    expect(result.warnings.some((warning) => warning.includes("baked"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("ambient"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("capped"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("Exporter-specific"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("attribution"))).toBe(true);
  });

  it.each([PNG, WEBP_LOSSLESS, WEBP_LOSSY])("accepts original one-pixel raster fixtures", (image) => {
    const result = parseUniversalVtt({ ...fixture(), resolution: { ...fixture().resolution, pixels_per_grid: 1 }, image });
    expect(result.image.width).toBe(1);
    expect(result.image.height).toBe(1);
    expect(result.image.byteLength).toBe(Buffer.from(image, "base64").length);
  });
});

describe("Universal VTT input boundaries", () => {
  it.each([undefined, 0.1, 0.4, 2, "0.3", Infinity])("rejects unsupported version %s", (format) => {
    expect(() => parseUniversalVtt({ ...fixture(), format })).toThrow(UniversalVttError);
  });
  it.each(["PK zip data", "{", "null", "[]"])("rejects non-document input %s", (input) => {
    expect(() => parseUniversalVtt(input)).toThrow(UniversalVttError);
  });
  it("rejects oversized JSON before attempting to parse", () => {
    expect(() => parseUniversalVtt(" ".repeat(UNIVERSAL_VTT_LIMITS.documentCharacters + 1))).toThrow("text limit");
  });
  it.each([NaN, Infinity, -Infinity, "100", 0, 1.25, 4097])("rejects invalid grid size %s", (pixels_per_grid) => {
    expect(() => parseUniversalVtt({ ...fixture(), resolution: { ...fixture().resolution, pixels_per_grid } })).toThrow("pixels_per_grid");
  });
  it("rejects map dimensions beyond decoder and scene bounds", () => {
    expect(() => parseUniversalVtt({ ...fixture(), resolution: { ...fixture().resolution, map_size: { x: 64, y: 64 } } })).toThrow("40 million");
    expect(() => parseUniversalVtt({ ...fixture(), resolution: { ...fixture().resolution, map_size: { x: 328, y: 1 } } })).toThrow("32768");
    expect(() => parseUniversalVtt({ ...fixture(), resolution: { ...fixture().resolution, map_size: { x: -1, y: 1 } } })).toThrow("positive");
  });
  it("rejects image dimensions inconsistent with the map geometry", () => {
    expect(() => parseUniversalVtt({ ...fixture(), image: PNG })).toThrow("pixel dimensions must match");
  });
  it.each(["https://example.com/map.png", "data:image/png;base64," + PNG, "SGVsbG8=", "SGVsbG9=", PNG + "\n", PNG.slice(0, -1)])("rejects malformed or external image %s", (image) => {
    expect(() => parseUniversalVtt({ ...fixture(), image })).toThrow("image");
  });
  it("rejects oversized embedded data before allocation", () => {
    expect(() => parseUniversalVtt({ ...fixture(), image: "A".repeat(4 * Math.ceil(UNIVERSAL_VTT_LIMITS.imageBytes / 3) + 4) })).toThrow("6 MiB");
  });
  it("rejects truncated PNG and wrong PNG CRC", () => {
    const bytes = Buffer.from(PNG, "base64");
    expect(() => parseUniversalVtt({ ...fixture(), image: encode(bytes.subarray(0, -3)) })).toThrow("image");
    bytes[45] = bytes[45]! ^ 1;
    expect(() => parseUniversalVtt({ ...fixture(), image: encode(bytes) })).toThrow("corrupt PNG");
  });
  it("rejects truncated WebP and inconsistent RIFF lengths", () => {
    const bytes = Buffer.from(WEBP_LOSSLESS, "base64");
    expect(() => parseUniversalVtt({ ...fixture(), image: encode(bytes.subarray(0, -2)) })).toThrow("WebP file length");
    bytes.writeUInt32LE(0xffffffff, 16);
    expect(() => parseUniversalVtt({ ...fixture(), image: encode(bytes) })).toThrow("WebP chunk");
  });
  it("rejects animated WebP headers", () => {
    const bytes = Buffer.alloc(30);
    bytes.write("RIFF", 0); bytes.writeUInt32LE(22, 4); bytes.write("WEBPVP8X", 8); bytes.writeUInt32LE(10, 16); bytes[20] = 2;
    expect(() => parseUniversalVtt({ ...fixture(), image: encode(bytes) })).toThrow("animated WebP");
  });
  it("rejects non-finite, degenerate, malformed and excessive geometry", () => {
    expect(() => parseUniversalVtt({ ...fixture(), line_of_sight: [[{ x: NaN, y: 0 }, { x: 1, y: 1 }]] })).toThrow("finite");
    expect(() => parseUniversalVtt({ ...fixture(), line_of_sight: [[{ x: 0, y: 0 }, { x: 0, y: 0 }]] })).toThrow("zero-length");
    expect(() => parseUniversalVtt({ ...fixture(), line_of_sight: [[{ x: 0, y: 0 }]] })).toThrow("two points");
    expect(() => parseUniversalVtt({ ...fixture(), portals: [{ ...portal(true), bounds: [] }] })).toThrow("two endpoints");
    expect(() => parseUniversalVtt({ ...fixture(), portals: [{ ...portal(true), closed: "false" }] })).toThrow("boolean");
    expect(() => parseUniversalVtt({ ...fixture(), portals: Array(UNIVERSAL_VTT_LIMITS.portals + 1).fill(portal(true)) })).toThrow("entry limit");
    expect(() => parseUniversalVtt({ ...fixture(), line_of_sight: [Array.from({ length: UNIVERSAL_VTT_LIMITS.wallSegments + 2 }, (_, index) => ({ x: index % 2, y: 0 }))] })).toThrow("entry limit");
    // The total cap spans separate polylines rather than just each input array.
    expect(() => parseUniversalVtt({ ...fixture(), line_of_sight: Array.from({ length: 10_001 }, () => [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]) })).toThrow("wall segment limit");
  });
  it("rejects unsafe light values and oversized light collections", () => {
    for (const invalid of [{ color: "url(https://example.com)" }, { range: -1 }, { range: Infinity }, { shadows: "false" }, { intensity: NaN }]) {
      expect(() => parseUniversalVtt({ ...fixture(), lights: [{ ...light(), ...invalid }] })).toThrow("lights[0]");
    }
    expect(() => parseUniversalVtt({ ...fixture(), lights: Array(UNIVERSAL_VTT_LIMITS.lights + 1).fill(light()) })).toThrow("entry limit");
  });
  it("retains a precise field path on input errors", () => {
    try {
      parseUniversalVtt({ ...fixture(), lights: [{ ...light(), position: { x: "bad", y: 1 } }] });
      throw new Error("Expected parser failure");
    } catch (error) {
      expect(error).toBeInstanceOf(UniversalVttError);
      expect((error as UniversalVttError).path).toBe("lights[0].position.x");
    }
  });
});
