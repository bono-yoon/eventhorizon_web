import fs from "node:fs";
import path from "node:path";

export function loadLocalEnv() {
  const envPath = path.resolve(".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

export function mysqlConnOpts() {
  if (
    !process.env.DB_HOST ||
    !process.env.DB_USER ||
    process.env.DB_PASSWORD === undefined ||
    !process.env.DB_NAME
  ) {
    throw new Error(
      "DB_HOST, DB_USER, DB_PASSWORD, DB_NAME 환경변수가 필요합니다."
    );
  }
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl:
      process.env.DB_SSL === "true"
        ? {
            rejectUnauthorized:
              process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
          }
        : undefined,
  };
}
