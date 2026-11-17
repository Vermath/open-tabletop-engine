# Single-node small-group capacity gate

Status: implemented as a deterministic local compatibility gate. This is not production-load evidence.

## Supported envelope

The declared self-hosted boundary is one API node, one API writer, one SQLite state store, and one active campaign with one GM plus five players. The bounded fixture contains 200 scene tokens, 300 chat messages, and 60 journal entries with six realtime connections.

Each of three fixed cycles performs three parallel HTTP reads, two sequential HTTP mutations, one player WebSocket reconnect, and realtime delivery checks to all six connected clients. REST requests use the actual ephemeral loopback listener rather than Fastify injection. The harness closes and reopens SQLite after the workload to verify the final token and chat mutations were persisted.

The canonical workload and conservative compatibility budgets are in [small-group-capacity-envelope.json](small-group-capacity-envelope.json). Result shape is in [small-group-capacity-result.schema.json](small-group-capacity-result.schema.json).

## Run the gate

From the repository root:

```powershell
pnpm perf:capacity
```

The command writes one JSON result to standard output and exits nonzero when any latency budget, dataset check, realtime delivery, reconnect, or SQLite reopen verification fails. Redirect the output to a run artifact when release evidence is needed; measured timings are deliberately not committed as universal values.

## Claim boundary

Passing means the checked machine completed the fixed small-group workload inside deliberately loose regression budgets. It does not establish a hosted-service SLO, maximum throughput, multi-campaign capacity, multi-node safety, internet latency, provider-backed asset performance, or production observation. Those remain deployment-specific evidence.
