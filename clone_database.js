import "dotenv/config";

import { spawn } from "node:child_process";
import { existsSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL;
const resetTarget = process.env.RESET_TARGET === "true";
const allowRemoteTarget = process.env.ALLOW_REMOTE_TARGET === "true";
const dumpPath = join(tmpdir(), `sanc-postgres-${Date.now()}.dump`);

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

if (!sourceUrl) fail("SOURCE_DATABASE_URL is missing from .env");
if (!targetUrl) fail("TARGET_DATABASE_URL is missing from .env");
if (!resetTarget) {
  fail("RESET_TARGET must be true because a full clone replaces the target public schema");
}

let source;
let target;
try {
  source = new URL(sourceUrl);
  target = new URL(targetUrl);
} catch {
  fail("SOURCE_DATABASE_URL or TARGET_DATABASE_URL is not a valid PostgreSQL URL");
}

if (!["postgres:", "postgresql:"].includes(source.protocol)) {
  fail("SOURCE_DATABASE_URL must use postgres:// or postgresql://");
}
if (!["postgres:", "postgresql:"].includes(target.protocol)) {
  fail("TARGET_DATABASE_URL must use postgres:// or postgresql://");
}

const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (!allowRemoteTarget && !localHosts.has(target.hostname)) {
  fail(
    `Refusing to erase remote target ${target.hostname}. Set ALLOW_REMOTE_TARGET=true only if intentional`,
  );
}

if (
  source.hostname === target.hostname &&
  (source.port || "5432") === (target.port || "5432") &&
  source.pathname === target.pathname
) {
  fail("Source and target appear to be the same database");
}

function describe(url) {
  return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: false });
    child.once("error", (error) => {
      if (error.code === "ENOENT") {
        reject(new Error(`${command} is not installed or is not in PATH`));
      } else {
        reject(error);
      }
    });
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with status ${code}`));
    });
  });
}

async function cloneDatabase() {
  console.log(`Source: ${describe(source)}`);
  console.log(`Target: ${describe(target)}`);
  console.log("WARNING: the target public schema will be permanently replaced.");

  try {
    console.log("\n1. Creating a complete schema-and-data dump...");
    await run("pg_dump", [
      "--dbname", sourceUrl,
      "--format=custom",
      "--file", dumpPath,
      "--no-owner",
      "--no-privileges",
      "--verbose",
    ]);

    if (!existsSync(dumpPath) || statSync(dumpPath).size === 0) {
      throw new Error("pg_dump did not create a non-empty dump");
    }

    console.log("\n2. Replacing the target public schema...");
    await run("psql", [
      "--dbname", targetUrl,
      "--set", "ON_ERROR_STOP=1",
      "--command",
      "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;",
    ]);

    console.log("\n3. Restoring schema, data, sequences, indexes and constraints...");
    await run("pg_restore", [
      "--dbname", targetUrl,
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      "--verbose",
      dumpPath,
    ]);

    console.log("\nDatabase clone completed successfully.");
  } finally {
    if (existsSync(dumpPath)) unlinkSync(dumpPath);
  }
}

cloneDatabase().catch((error) => {
  console.error(`\nDatabase clone failed: ${error.message}`);
  process.exitCode = 1;
});
