/**
 * Restore SensorControlPanel.tsx from transcript Write L845 + StrReplace patches.
 * All writes via fs.writeFileSync(..., 'utf8') — never StrReplace tool / PowerShell.
 */
const fs = require("fs");
const path = require("path");

const transcript =
  "C:/Users/User/.cursor/projects/d-projects-eventhorizon-web/agent-transcripts/fcc5b3fc-2824-4176-a6a9-c5ff0fd4586b/fcc5b3fc-2824-4176-a6a9-c5ff0fd4586b.jsonl";
const destPath =
  "D:/projects/eventhorizon_web/src/app/components/SensorControlPanel.tsx";
const PREFERRED_BASE_LINE = 845;
const FILE_TARGET = "SensorControlPanel.tsx";

function collectOps(fileTarget) {
  const lines = fs.readFileSync(transcript, "utf8").split(/\r?\n/);
  const ops = [];
  lines.forEach((line, idx) => {
    if (!line.includes(fileTarget)) return;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      return;
    }
    const content = obj?.message?.content;
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const name = block.name;
      const inp = block.input || {};
      const pth = String(inp.path || "");
      if (!pth.replace(/\//g, "\\").includes(fileTarget)) continue;
      if (name === "Write" && typeof inp.contents === "string") {
        ops.push({
          line: idx + 1,
          kind: "Write",
          contents: inp.contents,
          hangul: (inp.contents.match(/[\uAC00-\uD7A3]/g) || []).length,
          qruns: (inp.contents.match(/\?\?\?/g) || []).length,
        });
      } else if (name === "StrReplace") {
        const neu = inp.new_string || "";
        ops.push({
          line: idx + 1,
          kind: "StrReplace",
          old: inp.old_string || "",
          new: neu,
          replace_all: !!inp.replace_all,
          hangul: (neu.match(/[\uAC00-\uD7A3]/g) || []).length,
          qruns: (neu.match(/\?\?\?/g) || []).length,
        });
      }
    }
  });
  return ops;
}

function findAnchoredRange(content, oldStr) {
  if (!oldStr) return null;
  if (content.includes(oldStr)) {
    const start = content.indexOf(oldStr);
    return { start, end: start + oldStr.length, mode: "exact" };
  }
  const oldLines = oldStr.split("\n");
  if (oldLines.length < 6) return null;
  let bestPrefix = null;
  for (let n = Math.min(40, oldLines.length); n >= 4; n--) {
    const probe = oldLines.slice(0, n).join("\n");
    const idx = content.indexOf(probe);
    if (idx >= 0) {
      bestPrefix = { n, idx };
      break;
    }
  }
  let bestSuffix = null;
  for (let n = Math.min(40, oldLines.length); n >= 4; n--) {
    const probe = oldLines.slice(-n).join("\n");
    const idx = content.lastIndexOf(probe);
    if (idx >= 0) {
      bestSuffix = { n, end: idx + probe.length };
      break;
    }
  }
  if (bestPrefix && bestSuffix && bestSuffix.end > bestPrefix.idx) {
    const rangeLen = bestSuffix.end - bestPrefix.idx;
    if (rangeLen > oldStr.length * 0.4 && rangeLen < oldStr.length * 2.5) {
      return {
        start: bestPrefix.idx,
        end: bestSuffix.end,
        mode: `anchor p${bestPrefix.n}/s${bestSuffix.n}`,
      };
    }
  }
  return null;
}

function applySignalClassFix(s) {
  let out = s;
  out = out.replaceAll("#2dd4bf", "#2d6a4f");
  out = out.replaceAll("#588157", "#2d6a4f");
  out = out.replaceAll("#456a44", "#245a42");
  out = out.replace(
    /focus:ring-1\s+focus:ring-\[rgba\([^[\]]*\)\]/g,
    "eh-focus-signal"
  );
  out = out.replace(
    /focus:ring-\[rgba\([^[\]]*\)\]\s+focus:ring-1/g,
    "eh-focus-signal"
  );
  out = out.replace(
    /focus:ring-2\s+focus:ring-\[rgba\(232,163,23,0\.35\)\]/g,
    "eh-focus-signal"
  );
  out = out.replace(
    /focus-visible:ring-2\s+focus-visible:ring-\[rgba\(232,163,23,0\.35\)\]/g,
    "eh-focus-signal"
  );
  out = out.replace(
    /(^|[\s"'`])ring-1\s+ring-\[rgba\([^[\]]*\)\]/g,
    "$1eh-ring-signal"
  );
  out = out.replace(
    /(^|[\s"'`])ring-\[rgba\([^[\]]*\)\]\s+ring-1/g,
    "$1eh-ring-signal"
  );
  out = out.replace(
    /focus:ring-\[rgba\(\s*(45\s*,\s*106\s*,\s*79|88\s*,\s*129\s*,\s*87|45\s*,\s*212\s*,\s*191|232\s*,\s*163\s*,\s*23)[^[\]]*\]/g,
    "eh-focus-signal"
  );
  return out;
}

function removeDuplicateRemoteRow(content) {
  const marker = "function RemoteRow(";
  const first = content.indexOf(marker);
  const second = content.indexOf(marker, first + 1);
  if (second === -1) return content;
  const after = content.slice(second);
  const nextFn = after.search(/\nfunction [A-Z]/);
  const end = nextFn === -1 ? content.length : second + nextFn;
  return content.slice(0, second) + content.slice(end);
}

function fixTextWhite(content) {
  const alertPattern =
    /eh-alert|bg-\[var\(--eh-alert\)\]|bg-red|tone="danger"|text-\[var\(--eh-danger\)\]/;
  return content.replace(/(?<![\w-])text-white(?![\w-])/g, (match, offset) => {
    const slice = content.slice(Math.max(0, offset - 250), offset + 250);
    if (alertPattern.test(slice)) return match;
    return "text-[var(--eh-mist)]";
  });
}

function fixTsLockCheck(content) {
  // Remove dead key.id !== "lock" comparison (key.id is never "lock" in that branch)
  const oldBlock = `                          : closingFrom &&
                              closingFrom !== key.id &&
                              key.id !== "lock"
                            ? { opacity: 0 }
                            : undefined`;
  const newBlock = `                          : closingFrom && closingFrom !== key.id
                            ? { opacity: 0 }
                            : undefined`;
  if (content.includes(oldBlock)) {
    return content.replace(oldBlock, newBlock);
  }
  // Fallback: regex for whitespace variations
  return content.replace(
    /closingFrom\s*&&\s*\n\s*closingFrom\s*!==\s*key\.id\s*&&\s*\n\s*key\.id\s*!==\s*"lock"\s*\n\s*\?\s*\{\s*opacity:\s*0\s*\}/,
    "closingFrom && closingFrom !== key.id\n                            ? { opacity: 0 }"
  );
}

function rebuild() {
  const ops = collectOps(FILE_TARGET);

  let baseIdx = ops.findIndex(
    (op) =>
      op.kind === "Write" &&
      op.line === PREFERRED_BASE_LINE &&
      op.qruns === 0 &&
      op.hangul >= 20
  );
  if (baseIdx < 0) {
    throw new Error(`Write L${PREFERRED_BASE_LINE} not found`);
  }

  let content = ops[baseIdx].contents;
  let applied = 0;
  let failed = 0;

  for (let i = baseIdx + 1; i < ops.length; i++) {
    const op = ops[i];
    if (op.kind !== "StrReplace") continue;
    if (op.qruns > 0) continue;
    if (!op.old) {
      failed++;
      continue;
    }
    if (op.replace_all && content.includes(op.old)) {
      content = content.split(op.old).join(op.new);
      applied++;
      continue;
    }
    const range = findAnchoredRange(content, op.old);
    if (!range) {
      failed++;
      continue;
    }
    content = content.slice(0, range.start) + op.new + content.slice(range.end);
    applied++;
  }

  content = applySignalClassFix(content);
  content = removeDuplicateRemoteRow(content);
  content = fixTextWhite(content);
  content = fixTsLockCheck(content);
  content = content.replace(/\r\n/g, "\n");
  if (!content.endsWith("\n")) content += "\n";

  fs.writeFileSync(destPath, content, "utf8");

  const buf = fs.readFileSync(destPath);
  let utf8Ok = true;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    utf8Ok = false;
  }

  const text = buf.toString("utf8");
  const hangul = (text.match(/[\uAC00-\uD7A3]/g) || []).length;
  const remoteRowCount = (text.match(/function RemoteRow/g) || []).length;
  const ehFocus = (text.match(/eh-focus-signal/g) || []).length;
  const textWhite = (text.match(/(?<![\w-])text-white(?![\w-])/g) || []).length;
  const hoverWhite = (text.match(/hover:text-white/g) || []).length;
  const lockCheck = (text.match(/key\.id !== "lock"/g) || []).length;

  return {
    baseLine: ops[baseIdx].line,
    applied,
    failed,
    len: text.length,
    hangul,
    utf8Ok,
    remoteRowCount,
    ehFocus,
    textWhite,
    hoverWhite,
    lockCheck,
  };
}

const result = rebuild();
console.log(JSON.stringify(result, null, 2));

if (!result.utf8Ok || result.hangul <= 1000) {
  process.exit(1);
}
