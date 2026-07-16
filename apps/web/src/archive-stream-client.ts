export const campaignArchiveStreamContentType = "application/vnd.open-tabletop.ottx-stream";

const archiveStreamMagic = new TextEncoder().encode("OTTXSTRM1\n");
const archiveStreamPrefixBytes = archiveStreamMagic.length + 4;
const defaultMaxMetadataBytes = 64 * 1024 * 1024;
const maxErrorResponseBytes = 64 * 1024;

export type ArchiveStreamTransferPhase = "transferring" | "validating";

export interface ArchiveStreamTransferProgress {
  phase: ArchiveStreamTransferPhase;
  loadedBytes: number;
  totalBytes?: number;
}

export class ArchiveStreamClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ArchiveStreamClientError";
  }
}

export interface ArchiveDestination {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
}

interface ArchiveFileHandle {
  createWritable(): Promise<ArchiveDestination>;
}

interface ArchiveFilePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<ArchiveFileHandle>;
}

export function isCampaignArchiveStreamFile(file: Pick<File, "name" | "type">): boolean {
  return file.type.toLowerCase() === campaignArchiveStreamContentType || file.name.toLowerCase().endsWith(".ottx");
}

/**
 * Read only the bounded metadata frame needed to find the import target. Raw
 * asset frames stay on disk and are never materialized in browser JavaScript.
 */
export async function readCampaignArchiveStreamMetadata(
  file: Pick<File, "size" | "slice">,
  maxMetadataBytes = defaultMaxMetadataBytes,
): Promise<unknown> {
  const prefix = new Uint8Array(await file.slice(0, archiveStreamPrefixBytes).arrayBuffer());
  if (prefix.length !== archiveStreamPrefixBytes || !bytesEqual(prefix.subarray(0, archiveStreamMagic.length), archiveStreamMagic)) {
    throw new ArchiveStreamClientError("Campaign archive has an invalid stream header", "invalid_campaign_archive_stream");
  }
  const metadataBytes = new DataView(prefix.buffer, prefix.byteOffset + archiveStreamMagic.length, 4).getUint32(0, false);
  if (metadataBytes === 0 || metadataBytes > maxMetadataBytes) {
    throw new ArchiveStreamClientError(
      metadataBytes > maxMetadataBytes ? "Campaign archive metadata exceeds the browser safety limit" : "Campaign archive metadata frame is empty",
      metadataBytes > maxMetadataBytes ? "campaign_archive_too_large" : "invalid_campaign_archive_stream",
    );
  }
  const metadataEnd = archiveStreamPrefixBytes + metadataBytes;
  if (metadataEnd > file.size) {
    throw new ArchiveStreamClientError("Campaign archive ended before its metadata frame", "invalid_campaign_archive_stream");
  }
  const metadata = new Uint8Array(await file.slice(archiveStreamPrefixBytes, metadataEnd).arrayBuffer());
  if (metadata.length !== metadataBytes) {
    throw new ArchiveStreamClientError("Campaign archive ended before its metadata frame", "invalid_campaign_archive_stream");
  }
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(metadata)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("metadata is not an object");
    return parsed;
  } catch {
    throw new ArchiveStreamClientError("Campaign archive metadata is not valid JSON", "invalid_campaign_archive_stream");
  }
}

export async function downloadCampaignArchiveStream(options: {
  url: string;
  fileName: string;
  token: string;
  signal: AbortSignal;
  onProgress?: (progress: ArchiveStreamTransferProgress) => void;
  fetcher?: typeof fetch;
  selectDestination?: (fileName: string) => Promise<ArchiveDestination>;
}): Promise<{ bytesWritten: number }> {
  throwIfAborted(options.signal);
  const destination = await (options.selectDestination ?? selectArchiveDestination)(options.fileName);
  let closed = false;
  try {
    throwIfAborted(options.signal);
    const response = await (options.fetcher ?? fetch)(options.url, {
      method: "GET",
      headers: options.token ? { authorization: `Bearer ${options.token}` } : undefined,
      signal: options.signal,
    });
    if (!response.ok) {
      const responseText = await readBoundedResponseText(response, maxErrorResponseBytes);
      throw httpError(response.status, responseText, "Campaign archive export failed");
    }
    if (!response.body) throw new ArchiveStreamClientError("Campaign archive export did not provide a response stream", "archive_stream_unavailable");
    const totalBytes = positiveSafeInteger(response.headers.get("content-length"));
    let bytesWritten = 0;
    options.onProgress?.({ phase: "transferring", loadedBytes: 0, totalBytes });
    const reader = response.body.getReader();
    try {
      while (true) {
        throwIfAborted(options.signal);
        const { done, value } = await reader.read();
        if (done) break;
        throwIfAborted(options.signal);
        if (value.byteLength === 0) continue;
        await destination.write(value);
        bytesWritten += value.byteLength;
        options.onProgress?.({ phase: "transferring", loadedBytes: bytesWritten, totalBytes });
      }
    } finally {
      reader.releaseLock();
    }
    throwIfAborted(options.signal);
    await destination.close();
    closed = true;
    return { bytesWritten };
  } catch (error) {
    if (!closed) {
      try {
        await destination.abort(error);
      } catch {
        // The primary transfer error is more useful than a secondary abort failure.
      }
    }
    throw error;
  }
}

export function uploadCampaignArchiveStream<Result>(options: {
  url: string;
  file: File;
  token: string;
  idempotencyKey: string;
  signal: AbortSignal;
  onProgress?: (progress: ArchiveStreamTransferProgress) => void;
  xhrFactory?: () => XMLHttpRequest;
}): Promise<Result> {
  return new Promise<Result>((resolve, reject) => {
    if (options.signal.aborted) {
      reject(abortError());
      return;
    }
    const xhr = (options.xhrFactory ?? (() => new XMLHttpRequest()))();
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      options.signal.removeEventListener("abort", abortRequest);
      callback();
    };
    const abortRequest = () => xhr.abort();

    xhr.open("POST", options.url, true);
    xhr.setRequestHeader("content-type", campaignArchiveStreamContentType);
    xhr.setRequestHeader("idempotency-key", options.idempotencyKey);
    if (options.token) xhr.setRequestHeader("authorization", `Bearer ${options.token}`);
    xhr.upload.onprogress = (event) => {
      options.onProgress?.({
        phase: "transferring",
        loadedBytes: event.loaded,
        totalBytes: event.lengthComputable && event.total > 0 ? event.total : options.file.size,
      });
    };
    xhr.upload.onload = () => {
      options.onProgress?.({ phase: "validating", loadedBytes: options.file.size, totalBytes: options.file.size });
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        settle(() => reject(httpError(xhr.status, xhr.responseText, "Campaign archive import failed")));
        return;
      }
      try {
        const result = JSON.parse(xhr.responseText) as Result;
        settle(() => resolve(result));
      } catch {
        settle(() => reject(new ArchiveStreamClientError("Campaign archive import returned invalid JSON", "invalid_archive_import_response", xhr.status)));
      }
    };
    xhr.onerror = () => settle(() => reject(new ArchiveStreamClientError("Campaign archive upload failed because the connection was interrupted", "archive_upload_failed")));
    xhr.ontimeout = () => settle(() => reject(new ArchiveStreamClientError("Campaign archive upload timed out", "archive_upload_timeout")));
    xhr.onabort = () => settle(() => reject(abortError()));
    options.signal.addEventListener("abort", abortRequest, { once: true });
    options.onProgress?.({ phase: "transferring", loadedBytes: 0, totalBytes: options.file.size });
    xhr.send(options.file);
  });
}

export function isArchiveTransferAbort(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

async function selectArchiveDestination(fileName: string): Promise<ArchiveDestination> {
  const browserWindow = window as ArchiveFilePickerWindow;
  if (!browserWindow.showSaveFilePicker) {
    throw new ArchiveStreamClientError(
      "Large archive export requires a browser with direct-to-disk saving. Use Chrome or Edge, or use the small JSON export.",
      "archive_file_picker_unavailable",
    );
  }
  const handle = await browserWindow.showSaveFilePicker({
    suggestedName: fileName,
    types: [{ description: "Open Tabletop campaign archive", accept: { [campaignArchiveStreamContentType]: [".ottx"] } }],
  });
  return handle.createWritable();
}

async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - total;
      const chunk = value.subarray(0, remaining);
      chunks.push(chunk);
      total += chunk.byteLength;
      if (chunk.byteLength < value.byteLength) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function httpError(status: number, responseText: string, fallback: string): ArchiveStreamClientError {
  let body: unknown;
  try {
    body = responseText ? JSON.parse(responseText) : undefined;
  } catch {
    body = responseText;
  }
  const message = body && typeof body === "object" && !Array.isArray(body) && typeof (body as Record<string, unknown>).message === "string"
    ? (body as Record<string, unknown>).message as string
    : responseText.trim() || fallback;
  return new ArchiveStreamClientError(message, "archive_stream_http_error", status, body);
}

function positiveSafeInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function abortError(): DOMException {
  return new DOMException("Archive transfer cancelled", "AbortError");
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
