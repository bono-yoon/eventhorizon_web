function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`환경변수 ${name} 이(가) 필요합니다.`);
  }
  return value;
}

export function optionalEnv(name: string, fallback = ""): string {
  return readEnv(name) ?? fallback;
}

export function optionalNumber(name: string, fallback: number): number {
  const raw = readEnv(name);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
