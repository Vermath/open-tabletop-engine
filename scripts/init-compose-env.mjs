import {
  chmodSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const outputArgument = args.indexOf("--output");
if (outputArgument >= 0 && !args[outputArgument + 1])
  throw new Error("--output requires a path");
const outputPath = resolve(
  outputArgument >= 0 ? args[outputArgument + 1] : ".env",
);
const force = args.includes("--force");
if (existsSync(outputPath) && !force)
  throw new Error(`${outputPath} already exists; pass --force to replace it`);

let contents = readFileSync(resolve(".env.example"), "utf8");
const objectStoreSecret = randomBytes(32).toString("base64url");
const signingSecret = randomBytes(48).toString("base64url");

contents = setEnvironmentValue(
  contents,
  "MINIO_ROOT_PASSWORD",
  objectStoreSecret,
);
contents = setEnvironmentValue(
  contents,
  "OTTE_S3_ACCESS_KEY_ID",
  "opentabletop",
);
contents = setEnvironmentValue(
  contents,
  "OTTE_S3_SECRET_ACCESS_KEY",
  objectStoreSecret,
);
contents = setEnvironmentValue(
  contents,
  "OTTE_ASSET_URL_SIGNING_SECRET",
  signingSecret,
);
contents = setEnvironmentValue(contents, "VITE_API_URL", "");
contents = setEnvironmentValue(
  contents,
  "OTTE_S3_ALLOW_INSECURE_LOCAL_ENDPOINT",
  "true",
);
contents = setEnvironmentValue(
  contents,
  "OTTE_WEB_ORIGIN",
  "http://localhost:5173",
);
contents = setEnvironmentValue(
  contents,
  "OTTE_CORS_ALLOWED_ORIGINS",
  "http://localhost:5173",
);
contents = setEnvironmentValue(contents, "OTTE_TRUSTED_PROXY_HOPS", "1");
contents = setEnvironmentValue(contents, "OTTE_SESSION_COOKIE_SECURE", "false");
contents = setEnvironmentValue(
  contents,
  "OTTE_ALLOW_INSECURE_LOCAL_SESSION_COOKIE",
  "true",
);
contents = setEnvironmentValue(
  contents,
  "OTTE_SQLITE_BACKUP_RUN_ON_START",
  "true",
);
contents = setEnvironmentValue(
  contents,
  "OTTE_SQLITE_BACKUP_INTERVAL_SECONDS",
  "86400",
);
contents = setEnvironmentValue(
  contents,
  "OTTE_SQLITE_BACKUP_REASON",
  "compose-daily",
);

let wroteOutput = false;
try {
  writeFileSync(
    outputPath,
    contents.endsWith("\n") ? contents : `${contents}\n`,
    {
      encoding: "utf8",
      flag: force ? "w" : "wx",
      mode: 0o600,
    },
  );
  wroteOutput = true;
  restrictSecretFilePermissions(outputPath);
} catch (error) {
  if (wroteOutput) rmSync(outputPath, { force: true });
  throw error;
}
console.log(`Created ${outputPath} with generated local Compose secrets.`);

function setEnvironmentValue(source, name, value) {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^(?:#\\s*)?${escapeRegExp(name)}=.*$`, "m");
  return pattern.test(source)
    ? source.replace(pattern, line)
    : `${source.replace(/\s*$/, "")}\n${line}\n`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function restrictSecretFilePermissions(path) {
  if (process.platform !== "win32") {
    chmodSync(path, 0o600);
    return;
  }

  const identityResult = spawnSync("whoami.exe", [], {
    encoding: "utf8",
    windowsHide: true,
  });
  const identity = identityResult.stdout.trim();
  if (identityResult.status !== 0 || !identity) {
    throw new Error(
      `Could not determine the Windows account for ${path}: ${identityResult.stderr.trim() || "unknown error"}`,
    );
  }
  for (const args of [
    [path, "/reset"],
    [path, "/inheritance:r"],
    [path, "/grant:r", `${identity}:(F)`],
  ]) {
    const result = spawnSync("icacls.exe", args, {
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status !== 0) {
      throw new Error(
        `Could not restrict Windows ACL for ${path}: ${result.stderr.trim() || result.stdout.trim() || "unknown error"}`,
      );
    }
  }
}
