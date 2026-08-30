import type { DeviceCommand } from "./db";

/** 같은 명령군의 pending 요청은 최신 것만 유효하다. */
export const COMMAND_GROUP: Record<DeviceCommand, string> = {
  hold_on: "hold",
  hold_off: "hold",
  set_mode: "mode",
  set_interval: "interval",
  set_tilt_threshold: "threshold",
  reset_origin: "origin",
};

export function commandGroup(command: string): string {
  return COMMAND_GROUP[command as DeviceCommand] ?? command;
}

export function commandsInGroup(group: string): DeviceCommand[] {
  return (Object.entries(COMMAND_GROUP) as [DeviceCommand, string][])
    .filter(([, g]) => g === group)
    .map(([cmd]) => cmd);
}

/** fetch 시 명령군별 최신 pending/delivered만 남긴다. */
export function coalesceCommands<T extends { id: number; command: string }>(
  rows: T[]
): T[] {
  const best = new Map<string, T>();
  for (const row of rows) {
    const group = commandGroup(row.command);
    const prev = best.get(group);
    if (!prev || row.id > prev.id) best.set(group, row);
  }
  return [...best.values()].sort((a, b) => a.id - b.id);
}
