import type { PluginReview } from "@open-tabletop/core";

import { operatorTargetSetHash } from "./operator-mutation.js";
import type { LoadedPlugin } from "./plugin-runtime.js";

const registryMutationTails = new WeakMap<object, Promise<void>>();

export class PluginOperatorMutationError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "PluginOperatorMutationError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  response(): Record<string, unknown> {
    return {
      error: this.code,
      code: this.code,
      message: this.message,
      ...this.details,
    };
  }
}

/** Serializes compare-and-swap registry mutations across every route using one registry. */
export async function withPluginRegistryMutationLock<T>(
  registry: object,
  mutation: () => Promise<T>,
): Promise<T> {
  const previous = registryMutationTails.get(registry) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  registryMutationTails.set(registry, tail);
  await previous;
  try {
    return await mutation();
  } finally {
    release();
    if (registryMutationTails.get(registry) === tail)
      registryMutationTails.delete(registry);
  }
}

/** Exact generation for the mutable package inventory behind registry sync. */
export function pluginRegistryRevision(
  packages: readonly LoadedPlugin[],
): string {
  return operatorTargetSetHash(
    packages
      .map((plugin) => ({
        id: plugin.id,
        version: plugin.version,
        compatibleCore: plugin.compatibleCore,
        permissions: [...plugin.permissions].sort(),
        packageId: plugin.source.packageId,
        sourceType: plugin.source.type,
        registryUrl: plugin.source.registryUrl,
        packageUrl: plugin.source.packageUrl,
        manifestChecksum: plugin.source.manifestChecksum,
        checksum: plugin.source.checksum,
        packageChecksum: plugin.source.packageChecksum,
        syncedAt: plugin.source.syncedAt,
        trustStatus: plugin.trust.status,
        trustInstallable: plugin.trust.installable,
        availableVersions: [...plugin.distribution.availableVersions].sort(),
        latestVersion: plugin.distribution.latestVersion,
      }))
      .sort(
        (left, right) =>
          left.id.localeCompare(right.id) ||
          left.version.localeCompare(right.version) ||
          left.packageId.localeCompare(right.packageId),
      ),
  );
}

/**
 * Security-safe audit evidence for a package registration. The caller-supplied
 * package path is deliberately excluded because it can contain host paths,
 * usernames, mounted share names, or credentials embedded in a URL.
 */
export function pluginInstallAuditSummary(
  plugin: LoadedPlugin,
): Record<string, unknown> {
  return {
    pluginId: plugin.id,
    version: plugin.version,
    compatibleCore: plugin.compatibleCore,
    requestedPermissions: [...plugin.permissions].sort(),
    source: {
      type: plugin.source.type,
      packageId: plugin.source.packageId,
      sandbox: plugin.source.sandbox,
      manifestChecksum: plugin.source.manifestChecksum,
      ...(plugin.source.checksum
        ? { sourceChecksum: plugin.source.checksum }
        : {}),
      ...(plugin.source.packageChecksum
        ? { packageChecksum: plugin.source.packageChecksum }
        : {}),
    },
    trust: {
      status: plugin.trust.status,
      installable: plugin.trust.installable,
    },
  };
}

export function assertPluginRegistryRevision(
  packages: readonly LoadedPlugin[],
  expectedRevision: unknown,
): string {
  const currentRevision = pluginRegistryRevision(packages);
  if (typeof expectedRevision !== "string" || !expectedRevision.trim()) {
    throw new PluginOperatorMutationError(
      400,
      "precondition_required",
      "Plugin registry synchronization requires expectedRegistryRevision",
      { currentRegistryRevision: currentRevision },
    );
  }
  if (expectedRevision !== currentRevision) {
    throw new PluginOperatorMutationError(
      409,
      "stale_write",
      "Plugin registry inventory changed after it was loaded. Review the current generation and retry.",
      {
        expectedRegistryRevision: expectedRevision,
        currentRegistryRevision: currentRevision,
      },
    );
  }
  return currentRevision;
}

export function assertPluginReviewRevision(
  review: Pick<PluginReview, "id" | "reviewKey" | "updatedAt">,
  expectedUpdatedAt: unknown,
): void {
  if (
    typeof expectedUpdatedAt !== "string" ||
    !expectedUpdatedAt.trim() ||
    !Number.isFinite(Date.parse(expectedUpdatedAt))
  ) {
    throw new PluginOperatorMutationError(
      400,
      "precondition_required",
      "Plugin review changes require a valid expectedUpdatedAt",
      {
        reviewId: review.id,
        reviewKey: review.reviewKey,
        currentUpdatedAt: review.updatedAt,
      },
    );
  }
  if (expectedUpdatedAt !== review.updatedAt) {
    throw new PluginOperatorMutationError(
      409,
      "stale_write",
      "Plugin review changed after it was loaded. Review the current revision and retry.",
      {
        reviewId: review.id,
        reviewKey: review.reviewKey,
        expectedUpdatedAt,
        currentUpdatedAt: review.updatedAt,
      },
    );
  }
}
