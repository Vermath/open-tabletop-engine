#!/usr/bin/env bash
set -euo pipefail

# Use a private, fresh project and ephemeral loopback ports on shared Docker hosts.
smoke_dir=$(mktemp -d)
project="otte-smoke-$(openssl rand -hex 8)"
compose=(docker compose --project-name "$project" --env-file "$smoke_dir/compose.env" --profile worker)
cleanup() {
  result=$?
  if [[ -f "$smoke_dir/compose.env" ]]; then
    if (( result != 0 )); then
      "${compose[@]}" ps -a || true
    fi
    "${compose[@]}" down --volumes --remove-orphans --rmi local
  fi
  rm -f "$smoke_dir/compose.env"
  rmdir "$smoke_dir"
}
trap cleanup EXIT

node scripts/init-compose-env.mjs --output "$smoke_dir/compose.env"
export API_BIND_ADDRESS=127.0.0.1 WEB_BIND_ADDRESS=127.0.0.1 INFRA_BIND_ADDRESS=127.0.0.1
export API_PORT=0 WEB_PORT=0 MINIO_API_PORT=0 MINIO_CONSOLE_PORT=0
export OTTE_WORKER_PROFILE_ENABLED=true OTTE_WORKER_ID=smoke-worker
OTTE_WORKER_TOKEN=$(openssl rand -hex 32)
token_hash=$(printf '%s' "$OTTE_WORKER_TOKEN" | sha256sum | cut -d' ' -f1)
OTTE_WORKER_TOKEN_HASHES="$OTTE_WORKER_ID=sha256:$token_hash"
export OTTE_WORKER_TOKEN OTTE_WORKER_TOKEN_HASHES

"${compose[@]}" build api web worker
"${compose[@]}" up -d --wait --wait-timeout 180 api web
api_address=$("${compose[@]}" port api 4000)
web_address=$("${compose[@]}" port web 80)
node --input-type=module - "$api_address" "$web_address" <<'JS'
import assert from "node:assert/strict";

const [api, web] = process.argv.slice(2).map((address) => new URL("http://" + address));
async function get(base, path) {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, 200, path);
  return response;
}
const direct = await (await get(api, "/api/v1/health")).json();
const proxied = await (await get(web, "/api/v1/health")).json();
assert.equal(direct.ok, true);
assert.equal(proxied.service, "open-tabletop-api");
assert.match(direct.buildFingerprint, /^sha256:[a-f0-9]{64}$/);
assert.equal(proxied.buildFingerprint, direct.buildFingerprint);
const html = await (await get(web, "/")).text();
const entry = html.match(/<script\b[^>]*\bsrc="([^"]+)"/i);
assert.ok(entry, "Packaged frontend must serve a script entry point");
const script = await get(web, entry[1]);
assert.match(script.headers.get("content-type") ?? "", /javascript/);
console.log("Packaged frontend, API and proxy passed");
JS
"${compose[@]}" run --rm --no-deps -T -e OTTE_WORKER_LEASE_POLL=false -e OTTE_WORKER_LEASE_ONCE=true worker |
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const { status } = JSON.parse(readFileSync(0, "utf8"));
    if (!["idle", "succeeded"].includes(status)) throw new Error("Packaged worker failed its lease check");
    console.log("Packaged worker lease check passed:", status);
  '
