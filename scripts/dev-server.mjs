#!/usr/bin/env node
/**
 * Next.js dev 서버 래퍼.
 * - dev/build 캐시 분리 (.next-dev)로 ENOENT 방지
 * - 손상된 캐시 자동 정리 후 기동
 */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIST = process.env.NEXT_DIST_DIR || ".next-dev";
const DIST_PATH = path.join(ROOT, DIST);
const PORT = process.env.PORT || "3000";
const forceClean = process.argv.includes("--clean");

function freePort(port) {
  if (process.platform !== "win32") return;
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, {
      encoding: "utf8",
    });
    const pids = new Set(
      out
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/).pop())
        .filter((pid) => pid && /^\d+$/.test(pid) && pid !== "0")
    );
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
        console.log(`[dev] freed port ${port} (pid ${pid})`);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* port not in use */
  }
}

function distExists() {
  return fs.existsSync(DIST_PATH);
}

/** build-manifest 누락 등 전형적인 깨진 캐시 패턴 */
function isCacheCorrupt() {
  if (!distExists()) return false;

  const checks = [
    path.join(DIST_PATH, "server", "pages", "_app", "build-manifest.json"),
    path.join(DIST_PATH, "server", "app-paths-manifest.json"),
  ];

  const serverDir = path.join(DIST_PATH, "server");
  if (!fs.existsSync(serverDir)) return false;

  // server/ 는 있는데 manifest 가 없으면 깨진 상태
  const hasAnyManifest =
    fs.existsSync(path.join(DIST_PATH, "build-manifest.json")) ||
    fs.existsSync(path.join(DIST_PATH, "server", "app-paths-manifest.json")) ||
    fs.existsSync(path.join(DIST_PATH, "server", "middleware-manifest.json"));

  if (!hasAnyManifest) {
    const entries = fs.readdirSync(serverDir);
    if (entries.length > 0) return true;
  }

  // pages/_app 디렉터리만 있고 manifest 없음 (사용자 에러 패턴)
  const pagesApp = path.join(DIST_PATH, "server", "pages", "_app");
  if (
    fs.existsSync(pagesApp) &&
    !fs.existsSync(path.join(pagesApp, "build-manifest.json"))
  ) {
    return true;
  }

  return false;
}

function cleanDist() {
  if (distExists()) {
    fs.rmSync(DIST_PATH, { recursive: true, force: true });
    console.log(`[dev] cleaned ${DIST}`);
  }
}

if (forceClean || isCacheCorrupt()) {
  if (forceClean) {
    console.log("[dev] --clean: cache reset");
    freePort(PORT);
  } else {
    console.log("[dev] corrupted cache detected, auto-cleaning…");
  }
  cleanDist();
}

const useTurbopack = !process.argv.includes("--webpack");
const args = ["dev", "-p", PORT];
if (useTurbopack) args.splice(1, 0, "--turbopack");

console.log(`[dev] http://localhost:${PORT} (dist: ${DIST}${useTurbopack ? ", turbopack" : ""})`);

const child = spawn("npx", ["next", ...args], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    NEXT_DIST_DIR: DIST,
  },
});

child.on("exit", (code) => process.exit(code ?? 0));
