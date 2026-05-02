import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const tauriRoot = join(appRoot, "src-tauri");

function readVersion() {
  const packagePath = join(appRoot, "package.json");
  return JSON.parse(readFileSync(packagePath, "utf8")).version;
}

function expectedPaths(version = readVersion()) {
  const bundleRoot = join(tauriRoot, "target", "release", "bundle");
  return {
    appPath: join(bundleRoot, "macos", "JAWS.app"),
    dmgDir: join(bundleRoot, "dmg"),
    dmgPath: join(bundleRoot, "dmg", `JAWS_${version}_x64.dmg`)
  };
}

function assertAppBundle(path) {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`macOS app bundle is missing: ${path}`);
  }
  const infoPlist = join(path, "Contents", "Info.plist");
  if (!existsSync(infoPlist)) {
    throw new Error(`macOS app bundle is incomplete: ${infoPlist}`);
  }
}

export function buildHdiutilArgs(paths = expectedPaths()) {
  return [
    "create",
    "-volname",
    "JAWS",
    "-srcfolder",
    paths.appPath,
    "-ov",
    "-format",
    "UDZO",
    paths.dmgPath
  ];
}

export function createMacosDmg() {
  const paths = expectedPaths();
  assertAppBundle(paths.appPath);
  mkdirSync(paths.dmgDir, { recursive: true });
  rmSync(paths.dmgPath, { force: true });

  const result = spawnSync("hdiutil", buildHdiutilArgs(paths), {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `hdiutil failed with exit code ${result.status}.`,
        result.stdout?.trim(),
        result.stderr?.trim()
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (!existsSync(paths.dmgPath) || statSync(paths.dmgPath).size <= 0) {
    throw new Error(`DMG was not created: ${paths.dmgPath}`);
  }

  console.log(`Created macOS DMG: ${paths.dmgPath}`);
}

function selfTest() {
  const args = buildHdiutilArgs({
    appPath: "/tmp/JAWS.app",
    dmgDir: "/tmp/dmg",
    dmgPath: "/tmp/dmg/JAWS_0.0.0_x64.dmg"
  });
  const expected = [
    "create",
    "-volname",
    "JAWS",
    "-srcfolder",
    "/tmp/JAWS.app",
    "-ov",
    "-format",
    "UDZO",
    "/tmp/dmg/JAWS_0.0.0_x64.dmg"
  ];
  if (JSON.stringify(args) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected hdiutil args: ${JSON.stringify(args)}`);
  }
  console.log("macOS DMG helper self-test passed.");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  createMacosDmg();
}
