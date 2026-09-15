#!/usr/bin/env node
/**
 * UTF-8 / 한글 UI 문자열 무결성 검사.
 * Windows PowerShell 기본 인코딩(CP949)으로 저장된 파일이나
 * 깨진 한글(연속 ? 플레이스홀더)이 커밋·빌드되지 않도록 막는다.
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SCAN_DIRS = ["src", "scripts"];
const EXT = new Set([".ts", ".tsx", ".css", ".md", ".mjs", ".cjs", ".js"]);
const IGNORE_DIRS = new Set([
  "node_modules",
  ".next",
  "out",
  "build",
  ".git",
]);
const IGNORE_FILES = new Set([
  "scripts/check-encoding.mjs",
  "scripts/restore-company-sensors-board.cjs",
]);

/**
 * 깨진 한글 UI — 문자열이 공백 제외 전부 ? 인 경우만 (예: "??", "?? ??", "????")
 * nullish coalescing(??), optional chaining(?.), 정상 한글 문자열은 제외.
 */
const CORRUPTED_STRING_LITERAL =
  /(["'`])(?:\s*\?){2,}(?:\s+\?+)*\s*\1/g;

/** JSX 텍스트 노드가 순수 ? 인 경우: >??< */
const CORRUPTED_JSX_TEXT = />\s*\?{2,}\s*</g;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (IGNORE_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXT.has(path.extname(name))) out.push(full);
  }
  return out;
}

function isValidUtf8(buf) {
  try {
    const dec = new TextDecoder("utf-8", { fatal: true });
    dec.decode(buf);
    return true;
  } catch {
    return false;
  }
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function findCorruptedSnippets(text) {
  const hits = [];
  for (const re of [CORRUPTED_STRING_LITERAL, CORRUPTED_JSX_TEXT]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const snippet = m[0].replace(/\s+/g, " ").slice(0, 60);
      if (!hits.includes(snippet)) hits.push(snippet);
    }
  }
  return hits;
}

function checkFile(file) {
  const buf = fs.readFileSync(file);
  const issues = [];

  if (!isValidUtf8(buf)) {
    issues.push("invalid UTF-8 byte sequence");
    return issues;
  }

  const text = buf.toString("utf8");

  if (text.includes("\uFFFD")) {
    issues.push("contains Unicode replacement character (U+FFFD)");
  }

  const suspicious = findCorruptedSnippets(text);
  if (suspicious.length > 0) {
    issues.push(
      `corrupted Korean UI placeholders: ${suspicious.slice(0, 4).join(" | ")}`
    );
  }

  return issues;
}

function main() {
  const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d))).filter(
    (f) => !IGNORE_FILES.has(rel(f))
  );
  const failures = [];

  for (const file of files) {
    const issues = checkFile(file);
    if (issues.length) failures.push({ file: rel(file), issues });
  }

  if (failures.length === 0) {
    console.log(`check-encoding: OK (${files.length} files)`);
    return;
  }

  console.error("check-encoding: FAILED\n");
  for (const { file, issues } of failures) {
    console.error(`  ${file}`);
    for (const issue of issues) console.error(`    - ${issue}`);
  }
  console.error(
    "\n한글 UI가 연속 ? 로 깨졌거나 UTF-8이 아닌 인코딩으로 저장된 파일이 있습니다."
  );
  console.error(
    "Windows: PowerShell Set-Content/Out-File 금지 → Node fs.writeFileSync(path, content, 'utf8')"
  );
  process.exit(1);
}

main();
