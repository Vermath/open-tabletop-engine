import type { FastifyInstance } from "fastify";
import { buildApp as buildRawApp, type BuildAppOptions } from "../app.js";
import { MemoryStateStore } from "../store.js";
import { installLegacyMutationContractAdapter } from "./legacy-mutation-contract.js";

/**
 * Runs pre-concurrency integration scenarios against the hardened runtime while
 * supplying the exact current revision they historically observed implicitly.
 * Explicit idempotency keys and revisions (including empty or stale values)
 * remain untouched so negative contract coverage still reaches the real
 * production boundary. Legacy requests with no contract fields receive unique
 * keys plus the exact currently observed revision.
 */
export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const store = options.store ?? new MemoryStateStore();
  const app = await buildRawApp({ ...options, store });
  installLegacyMutationContractAdapter(app, store, {
    pluginRegistry: options.pluginRegistry,
  });
  return app;
}
