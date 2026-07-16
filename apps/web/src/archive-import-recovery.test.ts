import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { archiveImportRollbackConfirmationReady } from "./archive-import-recovery.js";

const componentSource = readFileSync(resolve(__dirname, "archive-import-recovery.tsx"), "utf8");
const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");

describe("archive import recovery UI", () => {
  it("requires the exact selected operation id before rollback", () => {
    expect(archiveImportRollbackConfirmationReady("arcimp_a", "arcimp_a")).toBe(true);
    expect(archiveImportRollbackConfirmationReady("arcimp_a", "arcimp_b")).toBe(false);
    expect(archiveImportRollbackConfirmationReady("arcimp_a", "")).toBe(false);
  });

  it("keeps operation selection and impact confirmation in an extracted surface", () => {
    expect(componentSource).toContain('aria-label="Archive import rollback operations"');
    expect(componentSource).toContain("Review rollback impact");
    expect(componentSource).toContain("Type operation id to confirm rollback");
    expect(componentSource).toContain("changed or referenced records will be preserved");
    expect(appSource).toContain("<ArchiveImportRecovery");
    expect(appSource).toContain("archive-import-operations/${operationId}/preview");
    expect(appSource).toContain("archive-import-operations/${operationId}/rollback");
    expect(appSource).not.toContain("rollback-before-${file.name}");
  });
});
