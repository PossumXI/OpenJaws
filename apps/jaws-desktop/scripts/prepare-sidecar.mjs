import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const repoRoot = resolve(appRoot, "..", "..");
const tauriRoot = join(appRoot, "src-tauri");
const binariesDir = join(tauriRoot, "binaries");
const extension = process.platform === "win32" ? ".exe" : "";

function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    stdio: "inherit",
    windowsHide: true
  });
}

function hostTriple() {
  try {
    return execFileSync("rustc", ["--print", "host-tuple"], {
      encoding: "utf8",
      windowsHide: true
    }).trim();
  } catch {
    const rustc = execFileSync("rustc", ["-Vv"], {
      encoding: "utf8",
      windowsHide: true
    });
    const match = rustc.match(/^host:\s+(\S+)$/m);
    if (!match) {
      throw new Error("Unable to determine Rust host target triple.");
    }
    return match[1];
  }
}

const source = join(repoRoot, "dist", `openjaws${extension}`);
if (!existsSync(source)) {
  run("bun", ["run", "build:native"], repoRoot);
}

if (!existsSync(source)) {
  throw new Error(`OpenJaws native binary was not created at ${source}`);
}

const stat = statSync(source);
if (!stat.isFile() || stat.size < 1024 * 1024) {
  throw new Error(`Refusing to bundle invalid sidecar candidate: ${source}`);
}

mkdirSync(binariesDir, { recursive: true });
const triple = hostTriple();
const target = join(binariesDir, `openjaws-${triple}${extension}`);
if (existsSync(target)) {
  const targetStat = statSync(target);
  if (targetStat.isFile() && targetStat.size === stat.size) {
    console.log(`Prepared ${basename(target)} for JAWS Desktop.`);
    process.exit(0);
  }
}
copyFileSync(source, target);

console.log(`Prepared ${basename(target)} for JAWS Desktop.`);
