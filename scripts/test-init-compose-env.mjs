import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const directory = mkdtempSync(join(tmpdir(), "otte-compose-env-"));
const output = join(directory, ".env");
try {
  const created = spawnSync(
    process.execPath,
    ["scripts/init-compose-env.mjs", "--output", output],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(created.status, 0, created.stderr);
  const env = parseEnvironment(readFileSync(output, "utf8"));
  assert.match(env.OTTE_ASSET_URL_SIGNING_SECRET ?? "", /^[A-Za-z0-9_-]{40,}$/);
  assert.match(env.MINIO_ROOT_PASSWORD ?? "", /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(env.OTTE_S3_SECRET_ACCESS_KEY, env.MINIO_ROOT_PASSWORD);
  assert.equal(env.VITE_API_URL, "");
  assert.equal(env.OTTE_S3_ALLOW_INSECURE_LOCAL_ENDPOINT, "true");
  assert.equal(env.OTTE_SESSION_COOKIE_SECURE, "false");
  assert.equal(env.OTTE_ALLOW_INSECURE_LOCAL_SESSION_COOKIE, "true");
  assert.equal(env.OTTE_SQLITE_BACKUP_RUN_ON_START, "true");
  assert.equal(env.OTTE_SQLITE_BACKUP_INTERVAL_SECONDS, "86400");

  const refusedOverwrite = spawnSync(
    process.execPath,
    ["scripts/init-compose-env.mjs", "--output", output],
    { cwd: root, encoding: "utf8" },
  );
  assert.notEqual(refusedOverwrite.status, 0);
  assert.match(refusedOverwrite.stderr, /already exists/);

  if (process.platform !== "win32") chmodSync(output, 0o644);
  const previousSigningSecret = env.OTTE_ASSET_URL_SIGNING_SECRET;
  const forced = spawnSync(
    process.execPath,
    ["scripts/init-compose-env.mjs", "--output", output, "--force"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(forced.status, 0, forced.stderr);
  const replaced = parseEnvironment(readFileSync(output, "utf8"));
  assert.notEqual(
    replaced.OTTE_ASSET_URL_SIGNING_SECRET,
    previousSigningSecret,
  );
  assert.equal(replaced.VITE_API_URL, "");
  assertRestrictedPermissions(output);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log("Compose environment initializer tests passed.");

function parseEnvironment(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function assertRestrictedPermissions(path) {
  if (process.platform !== "win32") {
    assert.equal(statSync(path).mode & 0o777, 0o600);
    return;
  }
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$path = $env:OTTE_SECRET_FILE_PATH",
    "$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
    "$acl = Get-Acl -LiteralPath $path",
    "$rules = @($acl.Access)",
    "$unexpected = @($rules | Where-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -ne $currentSid })",
    "[pscustomobject]@{ protected = $acl.AreAccessRulesProtected; rules = $rules.Count; unexpected = $unexpected.Count } | ConvertTo-Json -Compress",
  ].join("; ");
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      encoding: "utf8",
      windowsHide: true,
      env: { ...process.env, OTTE_SECRET_FILE_PATH: path },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), {
    protected: true,
    rules: 1,
    unexpected: 0,
  });
}
