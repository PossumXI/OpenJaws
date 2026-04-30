import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = join(scriptDir, "..");
const packagePath = join(appRoot, "package.json");
const outPath = join(appRoot, "src", "release-index.json");

function readPackageVersion() {
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  const version = String(pkg.version ?? "").trim();
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid JAWS package version in ${packagePath}: ${version}`);
  }
  return version;
}

function buildReleaseIndex(version) {
  const repo = "PossumXI/OpenJaws";
  const tag = `jaws-v${version}`;
  const githubBase = `https://github.com/${repo}`;
  const baseAssetUrl = `${githubBase}/releases/download/${tag}`;
  return {
    schemaVersion: 1,
    product: "JAWS",
    version,
    tag,
    repo,
    github: {
      releaseUrl: `${githubBase}/releases/tag/${tag}`,
      apiUrl: `https://api.github.com/repos/${repo}/releases/tags/${tag}`,
      baseAssetUrl
    },
    mirrors: [
      {
        id: "qline",
        label: "qline.site",
        pageUrl: "https://qline.site/downloads/jaws",
        routeBaseUrl: "https://qline.site/downloads/jaws"
      },
      {
        id: "iorch",
        label: "iorch.net",
        pageUrl: "https://iorch.net/downloads/jaws",
        routeBaseUrl: "https://iorch.net/downloads/jaws"
      }
    ],
    assets: [
      {
        id: "windows",
        route: "windows",
        file: `JAWS_${version}_x64-setup.exe`,
        requiresSignature: true
      },
      {
        id: "windows-msi",
        route: "windows-msi",
        file: `JAWS_${version}_x64_en-US.msi`,
        requiresSignature: true
      },
      {
        id: "macos",
        route: "macos",
        file: `JAWS_${version}_x64.dmg`,
        requiresSignature: false
      },
      {
        id: "macos-updater",
        route: "",
        file: "JAWS.app.tar.gz",
        requiresSignature: true
      },
      {
        id: "linux-deb",
        route: "linux-deb",
        file: `JAWS_${version}_amd64.deb`,
        requiresSignature: true
      },
      {
        id: "linux-rpm",
        route: "linux-rpm",
        file: `JAWS-${version}-1.x86_64.rpm`,
        requiresSignature: true
      },
      {
        id: "manifest",
        route: "latest.json",
        file: "latest.json",
        requiresSignature: false
      }
    ],
    updaterPlatforms: [
      {
        platform: "windows-x86_64",
        assetId: "windows"
      },
      {
        platform: "darwin-x86_64",
        assetId: "macos-updater"
      }
    ]
  };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function main(argv = process.argv.slice(2)) {
  const expected = stableJson(buildReleaseIndex(readPackageVersion()));
  if (argv.includes("--check")) {
    const actual = readFileSync(outPath, "utf8");
    if (actual !== expected) {
      console.error(`JAWS release index is stale: ${outPath}`);
      return 1;
    }
    console.log(`JAWS release index is current: ${outPath}`);
    return 0;
  }

  writeFileSync(outPath, expected);
  console.log(`Wrote JAWS release index: ${outPath}`);
  return 0;
}

process.exit(main());
