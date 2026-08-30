import fs from "fs";

const transcriptPath =
  "C:/Users/User/.cursor/projects/d-projects-eventhorizon-web/agent-transcripts/fcc5b3fc-2824-4176-a6a9-c5ff0fd4586b/fcc5b3fc-2824-4176-a6a9-c5ff0fd4586b.jsonl";
const outPath =
  "D:/projects/eventhorizon_web/src/app/components/SensorControlPanel.tsx";

const lines = fs.readFileSync(transcriptPath, "utf8").split("\n").filter(Boolean);

const ops = [];
for (let i = 0; i < lines.length; i++) {
  try {
    const obj = JSON.parse(lines[i]);
    const content = obj.message?.content || obj.content || [];
    for (const item of content) {
      const name = item.name;
      const input = item.input || {};
      if (
        input.path &&
        input.path.replace(/\\/g, "/").includes("SensorControlPanel.tsx")
      ) {
        if (name === "Write")
          ops.push({ type: "Write", line: i + 1, content: input.contents });
        if (name === "StrReplace")
          ops.push({
            type: "StrReplace",
            line: i + 1,
            old: input.old_string,
            new: input.new_string,
            replace_all: !!input.replace_all,
          });
      }
    }
  } catch {
    /* skip malformed lines */
  }
}

let content = ops.find((o) => o.type === "Write" && o.line === 845).content;
const patches = ops.filter((o) => o.type === "StrReplace" && o.line > 845);

let applied = 0;
const failed = [];

for (const p of patches) {
  if (p.old == null || p.new == null) {
    failed.push({ line: p.line, reason: "missing old or new" });
    continue;
  }
  if (p.replace_all) {
    if (content.includes(p.old)) {
      content = content.split(p.old).join(p.new);
      applied++;
    } else {
      failed.push({
        line: p.line,
        reason: "old not found (replace_all)",
        oldPreview: p.old.slice(0, 80),
      });
    }
  } else {
    const idx = content.indexOf(p.old);
    if (idx === -1) {
      failed.push({
        line: p.line,
        reason: "old not found",
        oldPreview: p.old.slice(0, 80),
      });
    } else {
      content = content.slice(0, idx) + p.new + content.slice(idx + p.old.length);
      applied++;
    }
  }
}

console.log(`Applied ${applied}/${patches.length} patches`);
if (failed.length) {
  console.log(`Failed ${failed.length}:`);
  for (const f of failed) {
    console.log(`  L${f.line}: ${f.reason}`);
    if (f.oldPreview) console.log(`    ${JSON.stringify(f.oldPreview)}`);
  }
}

// Post-restore fixes

// 1. Remove duplicate RemoteRow — keep first occurrence
const remoteRowMarker = "function RemoteRow(";
const firstIdx = content.indexOf(remoteRowMarker);
const secondIdx = content.indexOf(remoteRowMarker, firstIdx + 1);
if (secondIdx !== -1) {
  // Find end of second function (next top-level function or EOF before helpers)
  const afterSecond = content.slice(secondIdx);
  const nextFn = afterSecond.search(/\nfunction [A-Z]/);
  const endOfDuplicate =
    nextFn === -1 ? content.length : secondIdx + nextFn;
  content = content.slice(0, secondIdx) + content.slice(endOfDuplicate);
  console.log("Removed duplicate RemoteRow");
}

// 2. eh-focus-signal instead of focus:ring rgba for signal
content = content.replace(
  /focus:ring-2 focus:ring-\[rgba\(232,163,23,0\.35\)\]/g,
  "eh-focus-signal"
);
content = content.replace(
  /focus-visible:ring-2 focus-visible:ring-\[rgba\(232,163,23,0\.35\)\]/g,
  "eh-focus-signal"
);

// 3. text-[var(--eh-mist)] instead of text-white for body text
// Keep text-white on red/alert backgrounds — replace standalone text-white in non-alert contexts
content = content.replace(
  /(?<![\w-])text-white(?![\w-])/g,
  (match, offset) => {
    const slice = content.slice(Math.max(0, offset - 200), offset + 200);
    if (
      /eh-alert|bg-\[var\(--eh-alert\)\]|bg-red|danger|Notice tone="danger"/.test(
        slice
      )
    ) {
      return match;
    }
    return "text-[var(--eh-mist)]";
  }
);

const hangul = (content.match(/[\uAC00-\uD7A3]/g) || []).length;
const remoteRowCount = (content.match(/function RemoteRow/g) || []).length;
const focusRingCount = (content.match(/focus:ring-\[rgba\(232,163,23/g) || [])
  .length;
const ehFocusSignalCount = (content.match(/eh-focus-signal/g) || []).length;
const textWhiteCount = (content.match(/text-white/g) || []).length;
const brokenDeg = content.match(/\$\{[^}]+\}\?[^`]/g);

console.log("\nVerification:");
console.log("  Hangul count:", hangul);
console.log("  RemoteRow functions:", remoteRowCount);
console.log("  focus:ring rgba signal:", focusRingCount);
console.log("  eh-focus-signal:", ehFocusSignalCount);
console.log("  text-white:", textWhiteCount);
console.log("  Broken deg templates:", brokenDeg?.length ?? 0);
console.log("  Content length:", content.length);

fs.writeFileSync(outPath, content, "utf8");
console.log("\nWritten:", outPath);
