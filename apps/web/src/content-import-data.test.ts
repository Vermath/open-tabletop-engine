import { describe, expect, it } from "vitest";
import { csvItemImportEntities, parseDelimitedRows } from "./content-import-data.js";

describe("CSV content imports", () => {
  it("preserves quoted delimiters, escaped quotes, and multiline cells", () => {
    const body = [
      "name,body",
      '"Longsword, +1","A blade, finely balanced"',
      '"Mirror of Insight","The inscription says ""look twice"".\nIt glows at dusk."'
    ].join("\n");

    expect(csvItemImportEntities(body, "columns=name,body;delimiter=,;kind=item")).toEqual([
      {
        kind: "item",
        name: "Longsword, +1",
        body: "A blade, finely balanced"
      },
      {
        kind: "item",
        name: "Mirror of Insight",
        body: 'The inscription says "look twice".\nIt glows at dusk.'
      }
    ]);
  });

  it("supports BOM-prefixed headers and custom delimiters", () => {
    expect(csvItemImportEntities("\uFEFFname|notes\nTorch|Burns for one hour", "columns=name|notes;delimiter=|;kind=item")).toEqual([
      {
        kind: "item",
        name: "Torch",
        body: "Burns for one hour"
      }
    ]);
  });

  it("keeps trailing empty fields without inventing an extra row", () => {
    expect(parseDelimitedRows("one,two,\r\n", ",")).toEqual([["one", "two", ""]]);
    expect(csvItemImportEntities("name,body\nTorch,", "columns=name,body;delimiter=,;kind=item")).toEqual([
      { kind: "item", name: "Torch", body: "Imported item" }
    ]);
  });

  it("does not copy the name into the body when no body column is configured", () => {
    expect(csvItemImportEntities("id,name\nitem-1,Torch", "columns=id|name;delimiter=,;kind=item")).toEqual([
      { kind: "item", name: "Torch", body: "item-1" }
    ]);
  });
});
