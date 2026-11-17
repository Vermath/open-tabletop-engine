import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function ensureReleaseEvidenceOutputDirectory(
  destination,
  { pathExists = existsSync, createDirectory = mkdirSync } = {},
) {
  const destinationDirectory = dirname(destination);
  if (!pathExists(destinationDirectory)) {
    createDirectory(destinationDirectory, { recursive: true });
  }
}
