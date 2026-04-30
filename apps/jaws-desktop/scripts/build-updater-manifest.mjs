import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");

function parseArgs(argv) {
  const args = {
    baseUrl: "",
    bundleRoot: "",
    notes: "Signed JAWS Desktop update.",
    out: "",
    pubDate: new Date().toISOString(),
    selfTest: false,
    version: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--self-test") {
      args.selfTest = true;
      continue;
    }
    const next = argv[index + 1];
    if (!current.startsWith("--") || !next) {
      throw new Error(`Missing value for ${current}`);
    }
    index += 1;
    switch (current) {
      case "--base-url":
        args.baseUrl = next;
        break;
      case "--bundle-root":
        args.bundleRoot = next;
        break;
      case "--notes":
        args.notes = next;
        break;
      case "--out":
        args.out = next;
        break;
      case "--pub-date":
        args.pubDate = next;
        break;
      case "--version":
        args.version = next;
        break;
      default:
        throw new Error(`Unknown argument: ${current}`);
    }
  }

  return args;
}

async function walkFiles(root) {
  const output = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      output.push(...(await walkFiles(fullPath)));
    } else if (entry.isFile()) {
      output.push(fullPath);
    }
  }
  return output;
}

function normalizeBaseUrl(baseUrl) {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (!normalized.startsWith("https://")) {
    throw new Error("Updater manifest base URL must use HTTPS.");
  }
  return normalized;
}

function detectPlatform(artifactPath) {
  const name = basename(artifactPath).toLowerCase();
  const normalizedPath = artifactPath.replaceAll("\\", "/").toLowerCase();

  if (name.endsWith(".app.tar.gz")) {
    return { key: "darwin-x86_64", priority: 100 };
  }
  if (name.endsWith(".appimage")) {
    return { key: "linux-x86_64", priority: 100 };
  }
  if (name.endsWith(".appimage.tar.gz")) {
    return { key: "linux-x86_64", priority: 90 };
  }
  if (name.endsWith(".exe") && normalizedPath.includes("/nsis/")) {
    return { key: "windows-x86_64", priority: 100 };
  }
  if (name.endsWith(".msi")) {
    return { key: "windows-x86_64", priority: 80 };
  }
  if (name.endsWith(".zip") && normalizedPath.includes("/nsis/")) {
    return { key: "windows-x86_64", priority: 70 };
  }
  if (name.endsWith(".exe")) {
    return { key: "windows-x86_64", priority: 60 };
  }

  return null;
}

async function defaultVersion() {
  const packageJson = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));
  return packageJson.version;
}

async function buildManifest(options) {
  const bundleRoot = resolve(options.bundleRoot);
  const bundleRootStat = await stat(bundleRoot);
  if (!bundleRootStat.isDirectory()) {
    throw new Error(`Bundle root is not a directory: ${bundleRoot}`);
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const version = options.version || (await defaultVersion());
  const files = await walkFiles(bundleRoot);
  const candidates = new Map();

  for (const signaturePath of files.filter((file) => file.endsWith(".sig"))) {
    const artifactPath = signaturePath.slice(0, -extname(signaturePath).length);
    if (!files.includes(artifactPath)) {
      continue;
    }
    const platform = detectPlatform(artifactPath);
    if (!platform) {
      continue;
    }
    const current = candidates.get(platform.key);
    if (!current || platform.priority > current.priority) {
      candidates.set(platform.key, {
        artifactPath,
        priority: platform.priority,
        signature: (await readFile(signaturePath, "utf8")).trim()
      });
    }
  }

  if (candidates.size === 0) {
    throw new Error(`No signed Tauri updater artifacts found under ${bundleRoot}`);
  }

  const platforms = {};
  for (const [platform, candidate] of [...candidates.entries()].sort()) {
    const artifactName = basename(candidate.artifactPath);
    platforms[platform] = {
      signature: candidate.signature,
      url: `${baseUrl}/${encodeURIComponent(artifactName)}`
    };
  }

  return {
    version,
    notes: options.notes,
    pub_date: options.pubDate,
    platforms
  };
}

async function writeManifest(options) {
  const manifest = await buildManifest(options);
  const outputPath = resolve(options.out);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        out: outputPath,
        version: manifest.version,
        platforms: Object.keys(manifest.platforms)
      },
      null,
      2
    )
  );
}

async function selfTest() {
  const root = mkdtempSync(join(tmpdir(), "jaws-updater-manifest-"));
  try {
    const nsis = join(root, "nsis");
    const appimage = join(root, "appimage");
    const macos = join(root, "macos");
    await mkdir(nsis, { recursive: true });
    await mkdir(appimage, { recursive: true });
    await mkdir(macos, { recursive: true });
    writeFileSync(join(nsis, "JAWS_0.1.0_x64-setup.exe"), "windows");
    writeFileSync(join(nsis, "JAWS_0.1.0_x64-setup.exe.sig"), "sig-windows\n");
    writeFileSync(join(appimage, "JAWS_0.1.0_amd64.AppImage"), "linux");
    writeFileSync(join(appimage, "JAWS_0.1.0_amd64.AppImage.sig"), "sig-linux\n");
    writeFileSync(join(macos, "JAWS.app.tar.gz"), "darwin");
    writeFileSync(join(macos, "JAWS.app.tar.gz.sig"), "sig-darwin\n");

    const manifest = await buildManifest({
      baseUrl: "https://qline.site/downloads/jaws",
      bundleRoot: root,
      notes: "Test update",
      out: join(root, "latest.json"),
      pubDate: "2026-04-29T00:00:00.000Z",
      version: "0.1.0"
    });

    const expectedPlatforms = ["darwin-x86_64", "linux-x86_64", "windows-x86_64"];
    const actualPlatforms = Object.keys(manifest.platforms).sort();
    if (JSON.stringify(actualPlatforms) !== JSON.stringify(expectedPlatforms)) {
      throw new Error(`Unexpected platforms: ${actualPlatforms.join(", ")}`);
    }
    if (!manifest.platforms["windows-x86_64"].url.endsWith("JAWS_0.1.0_x64-setup.exe")) {
      throw new Error("Windows URL was not generated from the NSIS installer.");
    }
    if (manifest.platforms["darwin-x86_64"].signature !== "sig-darwin") {
      throw new Error("macOS signature was not trimmed and embedded.");
    }
    console.log("JAWS updater manifest self-test passed.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.selfTest) {
  await selfTest();
} else {
  if (!args.bundleRoot || !args.baseUrl || !args.out) {
    throw new Error(
      "Usage: node scripts/build-updater-manifest.mjs --bundle-root <dir> --base-url <https-url> --out <latest.json> [--version <semver>] [--notes <text>] [--pub-date <iso>]"
    );
  }
  await writeManifest(args);
}
