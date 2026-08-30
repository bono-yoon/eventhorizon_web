import { promises as fs } from "fs";
import path from "path";
import { createSeedStore } from "./seed";
import type { AppStore, UsageLog } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

let memory: AppStore | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function ensureLoaded(): Promise<AppStore> {
  if (memory) return memory;
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    memory = JSON.parse(raw) as AppStore;
    if (!memory.sensorOps) memory.sensorOps = {};
    if (!memory.sensorOpsAlerts) memory.sensorOpsAlerts = [];
    if (!memory.sensorOpsAlertReads) memory.sensorOpsAlertReads = {};
  } catch {
    memory = createSeedStore();
    await persist(memory);
  }
  return memory;
}

async function persist(store: AppStore) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${STORE_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tmp, STORE_PATH);
}

export async function readStore(): Promise<AppStore> {
  return ensureLoaded();
}

export async function updateStore(
  mutator: (store: AppStore) => void | Promise<void>
): Promise<AppStore> {
  const run = async () => {
    const store = await ensureLoaded();
    await mutator(store);
    memory = store;
    await persist(store);
    return store;
  };
  const result = writeQueue.then(run, run);
  writeQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export async function appendUsageLog(
  entry: Omit<UsageLog, "id" | "at"> & { at?: string }
) {
  await updateStore((store) => {
    store.usageLogs.unshift({
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      at: entry.at ?? new Date().toISOString(),
      actorUserId: entry.actorUserId,
      actorName: entry.actorName,
      action: entry.action,
      detail: entry.detail,
      meta: entry.meta,
    });
    store.usageLogs = store.usageLogs.slice(0, 500);
  });
}

export function resetStoreInMemory() {
  memory = null;
}
