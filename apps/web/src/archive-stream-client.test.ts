import { describe, expect, it } from "vitest";
import {
  campaignArchiveStreamContentType,
  downloadCampaignArchiveStream,
  isCampaignArchiveStreamFile,
  readCampaignArchiveStreamMetadata,
  uploadCampaignArchiveStream,
  type ArchiveDestination,
  type ArchiveStreamTransferProgress,
} from "./archive-stream-client.js";

describe("campaign archive browser streaming", () => {
  it("recognizes framed .ottx files without changing legacy JSON compatibility", () => {
    expect(isCampaignArchiveStreamFile({ name: "table.ottx", type: "" })).toBe(true);
    expect(isCampaignArchiveStreamFile({ name: "table.backup", type: campaignArchiveStreamContentType })).toBe(true);
    expect(isCampaignArchiveStreamFile({ name: "table.ottx.json", type: "application/json" })).toBe(false);
  });

  it("reads only the prefix and bounded metadata frame instead of the asset payload", async () => {
    const metadata = { format: "ottx", manifest: { campaignId: "camp_streamed" }, data: { campaigns: [{ id: "camp_streamed" }] } };
    const payload = framedArchive(metadata, new Uint8Array(2 * 1024 * 1024));
    const reads: Array<[number | undefined, number | undefined]> = [];
    const blob = new Blob([arrayBufferOf(payload)]);
    const file = {
      size: blob.size,
      slice(start?: number, end?: number) {
        reads.push([start, end]);
        return blob.slice(start, end);
      },
    };

    await expect(readCampaignArchiveStreamMetadata(file)).resolves.toEqual(metadata);
    expect(reads).toEqual([[0, 14], [14, 14 + new TextEncoder().encode(JSON.stringify(metadata)).length]]);
    expect(reads[1]![1]!).toBeLessThan(payload.byteLength / 100);
  });

  it("rejects invalid, truncated, and oversized metadata before reading an asset frame", async () => {
    const invalid = new Blob(["not-an-ottx-stream"]);
    await expect(readCampaignArchiveStreamMetadata(invalid)).rejects.toMatchObject({ code: "invalid_campaign_archive_stream" });

    const truncated = framedArchive({ format: "ottx" }).subarray(0, 15);
    await expect(readCampaignArchiveStreamMetadata(new Blob([arrayBufferOf(truncated)]))).rejects.toMatchObject({ code: "invalid_campaign_archive_stream" });

    const oversizedPrefix = framedArchive({ format: "ottx" });
    new DataView(oversizedPrefix.buffer).setUint32(10, 1025, false);
    await expect(readCampaignArchiveStreamMetadata(new Blob([arrayBufferOf(oversizedPrefix)]), 1024)).rejects.toMatchObject({ code: "campaign_archive_too_large" });
  });

  it("writes download chunks directly to the selected destination with bounded progress", async () => {
    const writes: Uint8Array[] = [];
    let closed = false;
    const destination: ArchiveDestination = {
      async write(chunk) { writes.push(new Uint8Array(chunk)); },
      async close() { closed = true; },
      async abort() { throw new Error("successful transfer must not abort"); },
    };
    const progress: ArchiveStreamTransferProgress[] = [];
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5]));
        controller.close();
      },
    }), { headers: { "content-length": "5" } });

    await expect(downloadCampaignArchiveStream({
      url: "/export/stream",
      fileName: "table.ottx",
      token: "token",
      signal: new AbortController().signal,
      fetcher: async () => response,
      selectDestination: async () => destination,
      onProgress: (entry) => progress.push(entry),
    })).resolves.toEqual({ bytesWritten: 5 });
    expect(writes.map((chunk) => [...chunk])).toEqual([[1, 2, 3], [4, 5]]);
    expect(Math.max(...writes.map((chunk) => chunk.byteLength))).toBe(3);
    expect(progress.at(-1)).toEqual({ phase: "transferring", loadedBytes: 5, totalBytes: 5 });
    expect(closed).toBe(true);
  });

  it("aborts the destination on cancellation so a partial export is not committed", async () => {
    const controller = new AbortController();
    let aborted = false;
    let closed = false;
    const destination: ArchiveDestination = {
      async write() {},
      async close() { closed = true; },
      async abort() { aborted = true; },
    };
    const response = new Response(new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(new Uint8Array([1, 2, 3]));
        stream.enqueue(new Uint8Array([4, 5, 6]));
      },
    }));

    await expect(downloadCampaignArchiveStream({
      url: "/export/stream",
      fileName: "table.ottx",
      token: "token",
      signal: controller.signal,
      fetcher: async () => response,
      selectDestination: async () => destination,
      onProgress: ({ loadedBytes }) => { if (loadedBytes > 0) controller.abort(); },
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(aborted).toBe(true);
    expect(closed).toBe(false);
  });

  it("uploads the File body with auth, stable idempotency, progress, and a validating boundary", async () => {
    const fake = new FakeXhr();
    fake.responseStatus = 200;
    fake.responseBody = JSON.stringify({ importedCampaignIds: ["camp_streamed"] });
    const progress: ArchiveStreamTransferProgress[] = [];
    const file = new File([new Uint8Array([1, 2, 3, 4])], "table.ottx", { type: campaignArchiveStreamContentType });

    await expect(uploadCampaignArchiveStream<{ importedCampaignIds: string[] }>({
      url: "/api/v1/import/campaign/stream?mode=upsert",
      file,
      token: "session-token",
      idempotencyKey: "stable-attempt",
      signal: new AbortController().signal,
      xhrFactory: () => fake as unknown as XMLHttpRequest,
      onProgress: (entry) => progress.push(entry),
    })).resolves.toEqual({ importedCampaignIds: ["camp_streamed"] });
    expect(fake.method).toBe("POST");
    expect(fake.url).toContain("mode=upsert");
    expect(fake.headers).toMatchObject({
      "content-type": campaignArchiveStreamContentType,
      "idempotency-key": "stable-attempt",
      authorization: "Bearer session-token",
    });
    expect(fake.body).toBe(file);
    expect(progress.map((entry) => entry.phase)).toEqual(["transferring", "transferring", "validating"]);
  });

  it("aborts an in-flight upload and reports cancellation distinctly from server validation", async () => {
    const fake = new FakeXhr(false);
    const controller = new AbortController();
    const file = new File([new Uint8Array([1, 2, 3])], "table.ottx");
    const transfer = uploadCampaignArchiveStream({
      url: "/api/v1/import/campaign/stream",
      file,
      token: "",
      idempotencyKey: "cancelled-attempt",
      signal: controller.signal,
      xhrFactory: () => fake as unknown as XMLHttpRequest,
    });

    controller.abort();
    await expect(transfer).rejects.toMatchObject({ name: "AbortError" });
    expect(fake.aborted).toBe(true);
  });
});

class FakeXhr {
  readonly upload: { onprogress: ((event: ProgressEvent) => void) | null; onload: (() => void) | null } = { onprogress: null, onload: null };
  readonly headers: Record<string, string> = {};
  method = "";
  url = "";
  status = 0;
  responseText = "";
  responseStatus = 0;
  responseBody = "";
  body: Document | XMLHttpRequestBodyInit | null = null;
  aborted = false;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor(private readonly completeOnSend = true) {}

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
  }

  send(body: Document | XMLHttpRequestBodyInit | null) {
    this.body = body;
    if (!this.completeOnSend) return;
    const size = body instanceof Blob ? body.size : 0;
    this.upload.onprogress?.({ loaded: size, total: size, lengthComputable: true } as ProgressEvent);
    this.upload.onload?.();
    this.status = this.responseStatus;
    this.responseText = this.responseBody;
    this.onload?.();
  }

  abort() {
    this.aborted = true;
    this.onabort?.();
  }
}

function framedArchive(metadata: unknown, assetBytes = new Uint8Array()): Uint8Array {
  const magic = new TextEncoder().encode("OTTXSTRM1\n");
  const body = new TextEncoder().encode(JSON.stringify(metadata));
  const result = new Uint8Array(magic.length + 4 + body.length + assetBytes.length);
  result.set(magic, 0);
  new DataView(result.buffer).setUint32(magic.length, body.length, false);
  result.set(body, magic.length + 4);
  result.set(assetBytes, magic.length + 4 + body.length);
  return result;
}

function arrayBufferOf(value: Uint8Array): ArrayBuffer {
  return new Uint8Array(value).buffer;
}
