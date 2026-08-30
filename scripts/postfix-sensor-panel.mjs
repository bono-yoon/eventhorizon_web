import fs from "fs";

const path =
  "D:/projects/eventhorizon_web/src/app/components/SensorControlPanel.tsx";
let content = fs.readFileSync(path, "utf8");

// 1. Remove duplicate RemoteRow — keep first
const marker = "function RemoteRow(";
const first = content.indexOf(marker);
const second = content.indexOf(marker, first + 1);
if (second !== -1) {
  const after = content.slice(second);
  const nextFn = after.search(/\nfunction [A-Z]/);
  const end = nextFn === -1 ? content.length : second + nextFn;
  content = content.slice(0, second) + content.slice(end);
  console.log("Removed duplicate RemoteRow");
}

// 2. eh-focus-signal for remaining signal focus rings
content = content.replace(
  /focus:ring-2\s+focus:ring-\[rgba\(232,163,23,0\.35\)\]/g,
  "eh-focus-signal"
);
content = content.replace(
  /focus-visible:ring-2\s+focus-visible:ring-\[rgba\(232,163,23,0\.35\)\]/g,
  "eh-focus-signal"
);
content = content.replace(
  /focus:ring-1\s+focus:ring-\[rgba\(232,163,23[^[\]]*\)\]/g,
  "eh-focus-signal"
);

// 3. text-white -> text-[var(--eh-mist)] except hover states and alert contexts
const alertPattern =
  /eh-alert|bg-\[var\(--eh-alert\)\]|bg-red|tone="danger"|text-\[var\(--eh-danger\)\]/;

content = content.replace(/(?<![\w-])text-white(?![\w-])/g, (match, offset) => {
  const slice = content.slice(Math.max(0, offset - 250), offset + 250);
  if (alertPattern.test(slice)) return match;
  return "text-[var(--eh-mist)]";
});

const hangul = (content.match(/[\uAC00-\uD7A3]/g) || []).length;
console.log("Hangul:", hangul);
console.log("RemoteRow:", (content.match(/function RemoteRow/g) || []).length);
console.log("eh-focus-signal:", (content.match(/eh-focus-signal/g) || []).length);
console.log("text-white:", (content.match(/text-white/g) || []).length);
console.log(
  "focus:ring rgba:",
  (content.match(/focus:ring-\[rgba/g) || []).length
);
console.log(
  "Broken deg:",
  (content.match(/\$\{[^}]+\}\?[^`]/g) || []).length
);

fs.writeFileSync(path, content, "utf8");
