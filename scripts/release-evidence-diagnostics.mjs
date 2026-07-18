import { createHash } from "node:crypto";

export const releaseEvidenceDiagnosticMaxBytes = 16 * 1024;
export const releaseEvidenceOutputDigestScope =
  "bounded-redacted-diagnostic-v1";
export const releaseEvidenceRawOutputMaxBytes = 32 * 1024 * 1024;

const sensitiveName = String.raw`[a-z0-9_.-]{0,64}(?:token|secret|password|passwd|api[_-]?key|private[_-]?key|access[_-]?key|signing[_-]?key|authorization|auth|cookie|credential)[a-z0-9_.-]{0,64}`;

/**
 * Return the useful tail of command output while keeping release artifacts
 * small and removing common credential forms before anything reaches disk.
 */
export function boundedRedactedDiagnostic(
  output,
  {
    maximumBytes = releaseEvidenceDiagnosticMaxBytes,
    sourceTruncatedBytes = 0,
  } = {},
) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 512) {
    throw new RangeError("maximumBytes must be an integer of at least 512");
  }
  const redactionWindowBytes = Math.min(
    256 * 1024,
    Math.max(64 * 1024, maximumBytes * 8),
  );
  const sourceWindow = rawTail(String(output ?? ""), redactionWindowBytes);
  const normalized = stripUnsafeTerminalText(
    `${sourceWindow.truncated ? "[... earlier raw output omitted before redaction ...]\n" : ""}${sourceWindow.text}`,
  );
  const redacted = redactSecrets(normalized);
  const clipped = boundedTail(redacted, maximumBytes);
  return {
    text: clipped.text,
    capturedBytes: Buffer.byteLength(clipped.text, "utf8"),
    maximumBytes,
    truncated:
      clipped.truncated || sourceWindow.truncated || sourceTruncatedBytes > 0,
    redactionApplied: redacted !== normalized,
  };
}

/**
 * Retain only the most recent UTF-8 bytes from a command. The returned
 * truncatedBytes count includes any partial leading code point that had to be
 * discarded to keep the retained text valid UTF-8.
 */
export function appendBoundedOutput(
  current,
  addition,
  maximumBytes = releaseEvidenceRawOutputMaxBytes,
) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new RangeError("maximumBytes must be a positive integer");
  }
  const currentBytes = Buffer.from(String(current ?? ""), "utf8");
  const additionBytes = Buffer.from(String(addition ?? ""), "utf8");
  const totalBytes = currentBytes.byteLength + additionBytes.byteLength;
  if (totalBytes <= maximumBytes) {
    return {
      output: `${current ?? ""}${addition ?? ""}`,
      truncatedBytes: 0,
    };
  }
  const combined = Buffer.concat([currentBytes, additionBytes], totalBytes);
  const output = combined
    .subarray(totalBytes - maximumBytes)
    .toString("utf8")
    .replace(/^\uFFFD+/, "");
  return {
    output,
    truncatedBytes: totalBytes - Buffer.byteLength(output, "utf8"),
  };
}

/**
 * Produce the only output representation stored in release evidence. Hashing
 * the same bounded, redacted text that may be published avoids turning an
 * artifact into an offline secret-comparison oracle.
 */
export function summarizeReleaseEvidenceOutput(
  output,
  { sourceTruncatedBytes = 0 } = {},
) {
  const diagnostic = boundedRedactedDiagnostic(output, {
    sourceTruncatedBytes,
  });
  return {
    diagnostic,
    outputDigestScope: releaseEvidenceOutputDigestScope,
    outputSha256: createHash("sha256")
      .update(diagnostic.text, "utf8")
      .digest("hex"),
  };
}

function rawTail(value, maximumBytes) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength <= maximumBytes)
    return { text: value, truncated: false };
  return {
    text: bytes
      .subarray(bytes.byteLength - maximumBytes)
      .toString("utf8")
      .replace(/^\uFFFD+/, ""),
    truncated: true,
  };
}

function redactSecrets(value) {
  let result = value;
  result = result.replace(
    /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----[\s\S]*?(?:-----END \1-----|$)/gi,
    "[REDACTED PRIVATE KEY]",
  );
  result = result.replace(
    /\b([a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s/@]+)@/gi,
    "$1[REDACTED]@",
  );
  result = result.replace(
    /^(\s*(?:authorization|proxy-authorization|cookie|set-cookie)\s*:\s*).*$/gim,
    "$1[REDACTED]",
  );
  result = result.replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, "$1 [REDACTED]");
  result = result.replace(
    /(\s(?:-u|--user)(?:=|\s+))(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[^\s]+)/gi,
    "$1[REDACTED]",
  );
  result = result.replace(
    /([?&#][a-z0-9_.-]*(?:token|secret|password|signature|credential|api[_-]?key|access[_-]?key|auth|sig)[a-z0-9_.-]*=)[^&#\s]+/gi,
    "$1[REDACTED]",
  );

  const doubleQuotedAssignment = new RegExp(
    `((?:["']?)${sensitiveName}(?:["']?)\\s*[:=]\\s*)"(?:\\\\.|[^"\\\\\\r\\n])*"`,
    "gi",
  );
  result = result.replace(doubleQuotedAssignment, '$1"[REDACTED]"');
  const singleQuotedAssignment = new RegExp(
    `((?:["']?)${sensitiveName}(?:["']?)\\s*[:=]\\s*)'(?:\\\\.|[^'\\\\\\r\\n])*'`,
    "gi",
  );
  result = result.replace(singleQuotedAssignment, "$1'[REDACTED]'");
  const lineAssignment = new RegExp(
    `^(\\s*(?:export\\s+|set\\s+)?(?:--)?["']?${sensitiveName}["']?\\s*[:=]\\s*).*$`,
    "gim",
  );
  result = result.replace(lineAssignment, "$1[REDACTED]");
  const unquotedAssignment = new RegExp(
    `((?:^|[\\s,{])(?:--)?["']?${sensitiveName}["']?\\s*[:=]\\s*)(?!\\[REDACTED\\])([^\\s,;}]+)`,
    "gim",
  );
  result = result.replace(unquotedAssignment, "$1[REDACTED]");
  const doubleQuotedCommandArgument = new RegExp(
    `((?:^|\\s)--?${sensitiveName}\\s+)"(?:\\\\.|[^"\\\\\\r\\n])*"`,
    "gim",
  );
  result = result.replace(doubleQuotedCommandArgument, '$1"[REDACTED]"');
  const singleQuotedCommandArgument = new RegExp(
    `((?:^|\\s)--?${sensitiveName}\\s+)'(?:\\\\.|[^'\\\\\\r\\n])*'`,
    "gim",
  );
  result = result.replace(singleQuotedCommandArgument, "$1'[REDACTED]'");
  const unquotedCommandArgument = new RegExp(
    `((?:^|\\s)--?${sensitiveName}\\s+)(?!\\[REDACTED\\])[^\\s"']+`,
    "gim",
  );
  result = result.replace(unquotedCommandArgument, "$1[REDACTED]");

  for (const token of [
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
    /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    /\bnpm_[A-Za-z0-9]{20,}\b/g,
    /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  ]) {
    result = result.replace(token, "[REDACTED TOKEN]");
  }
  return result;
}

function stripUnsafeTerminalText(value) {
  return value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "?");
}

function boundedTail(value, maximumBytes) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength <= maximumBytes)
    return { text: value, truncated: false };
  const marker = "[... earlier command output omitted ...]\n";
  const markerBytes = Buffer.byteLength(marker, "utf8");
  let tail = bytes
    .subarray(bytes.byteLength - (maximumBytes - markerBytes))
    .toString("utf8")
    .replace(/^\uFFFD+/, "");
  while (Buffer.byteLength(marker + tail, "utf8") > maximumBytes) {
    tail = tail.slice(1);
  }
  return { text: marker + tail, truncated: true };
}
