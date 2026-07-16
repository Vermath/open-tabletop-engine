import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ArchiveTransferProgress, archiveTransferCanCancel, archiveTransferMessage, type ArchiveTransferState } from "./archive-transfer-progress.js";

describe("archive transfer progress", () => {
  it("renders determinate byte progress and an accessible cancellation action", () => {
    const state: ArchiveTransferState = { direction: "export", phase: "transferring", fileName: "table.ottx", loadedBytes: 1024, totalBytes: 4096 };
    const html = renderToStaticMarkup(<ArchiveTransferProgress state={state} onCancel={vi.fn()} />);
    expect(html).toContain("Archive transfer progress");
    expect(html).toContain("Archive export bytes transferred");
    expect(html).toContain("value=\"1024\"");
    expect(html).toContain("max=\"4096\"");
    expect(html).toContain("Cancel archive export");
  });

  it("states validation rollback, cancellation, retry, and no-resume semantics truthfully", () => {
    const validating: ArchiveTransferState = { direction: "import", phase: "validating", fileName: "large.ottx", loadedBytes: 2048, totalBytes: 2048 };
    const cancelled: ArchiveTransferState = { ...validating, phase: "cancelled" };
    const failed: ArchiveTransferState = { ...validating, phase: "failed", error: "connection lost" };
    expect(archiveTransferCanCancel(validating)).toBe(true);
    expect(archiveTransferMessage(validating)).toContain("roll back staged work");
    expect(archiveTransferMessage(cancelled)).toContain("same idempotency key");
    expect(archiveTransferMessage(failed)).toContain("byte-range resume is not supported");
  });

  it("does not offer cancellation after completion", () => {
    const state: ArchiveTransferState = { direction: "import", phase: "complete", fileName: "table.ottx", loadedBytes: 4096, totalBytes: 4096 };
    const html = renderToStaticMarkup(<ArchiveTransferProgress state={state} onCancel={vi.fn()} />);
    expect(html).toContain("Import complete");
    expect(html).not.toContain("Cancel archive import");
  });
});
