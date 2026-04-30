import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const tauriRoot = join(appRoot, "src-tauri");
const configPath = join(tauriRoot, "tauri.conf.json");
const packagePath = join(appRoot, "package.json");
const iconPath = join(tauriRoot, "icons", "icon.ico");
const brandingRoots = [join(appRoot, "src"), join(tauriRoot, "src"), join(tauriRoot, "tauri.conf.json")];
const blockedBrandingPattern = /\b(?:claude|anthropic)\b/i;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const config = readJson(configPath);
const pkg = readJson(packagePath);
const updater = config.plugins?.updater ?? {};
const errors = [];
const requiredPublisher = "AROBI TECHNOLOGY ALLIANCE A OPAL MAR GROUP CORPORATION NJ USA";

function require(condition, message) {
  if (!condition) errors.push(message);
}

function parseArgs(argv) {
  return {
    requireSigningKey: argv.includes("--require-signing-key"),
  };
}

function signingKeyReady() {
  const direct = String(process.env.TAURI_SIGNING_PRIVATE_KEY || "").trim();
  const ciAlias = String(process.env.JAWS_TAURI_SIGNING_PRIVATE_KEY || "").trim();
  return direct.length >= 40 || ciAlias.length >= 40;
}

const args = parseArgs(process.argv.slice(2));
const publicKey = String(process.env.JAWS_TAURI_UPDATER_PUBLIC_KEY || updater.pubkey || "").trim();
const endpoints = Array.isArray(updater.endpoints) ? updater.endpoints : [];
const endpointUrls = endpoints.map((endpoint) => {
  try {
    return new URL(endpoint);
  } catch {
    return null;
  }
});

function endpointMatchesHost(url, host) {
  if (!url) return false;
  const hostname = url.hostname.toLowerCase();
  return hostname === host || hostname.endsWith(`.${host}`);
}

require(config.productName === "JAWS", "Tauri productName must remain JAWS.");
require(pkg.version === config.version, "Desktop package version and Tauri app version must match.");
require(config.bundle?.createUpdaterArtifacts === true, "bundle.createUpdaterArtifacts must be true for live updates.");
require(config.bundle?.publisher === requiredPublisher, `bundle.publisher must be ${requiredPublisher}.`);
require(config.bundle?.externalBin?.includes("binaries/openjaws"), "OpenJaws sidecar must be listed in bundle.externalBin.");
require(publicKey.length >= 40, "Set JAWS_TAURI_UPDATER_PUBLIC_KEY or tauri.conf updater.pubkey before release.");
require(endpoints.length >= 2, "Updater must keep both qline.site and iorch.net endpoints.");
require(endpointUrls.every((url) => url?.protocol === "https:"), "Updater endpoints must use HTTPS.");
require(endpointUrls.some((url) => endpointMatchesHost(url, "qline.site")), "Updater endpoints must include qline.site.");
require(endpointUrls.some((url) => endpointMatchesHost(url, "iorch.net")), "Updater endpoints must include iorch.net.");
require(existsSync(iconPath) && statSync(iconPath).size > 1024, "Native Windows icon must exist at src-tauri/icons/icon.ico.");
if (args.requireSigningKey) {
  require(
    signingKeyReady(),
    "Set TAURI_SIGNING_PRIVATE_KEY or JAWS_TAURI_SIGNING_PRIVATE_KEY before running a signed JAWS bundle build."
  );
}

function collectFiles(path) {
  if (!existsSync(path)) return [];
  const stat = statSync(path);
  if (stat.isFile()) return [path];
  if (!stat.isDirectory()) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return collectFiles(child);
    return entry.isFile() ? [child] : [];
  });
}

const legacyBrandingHits = brandingRoots
  .flatMap(collectFiles)
  .filter((path) => /\.(?:css|html|json|rs|ts|tsx|svg)$/.test(path))
  .filter((path) => blockedBrandingPattern.test(readFileSync(path, "utf8")));

require(
  legacyBrandingHits.length === 0,
  `JAWS Desktop release surface contains legacy provider branding: ${legacyBrandingHits
    .map((path) => path.replace(`${appRoot}\\`, "").replace(`${appRoot}/`, ""))
    .join(", ")}`
);

if (errors.length > 0) {
  console.error("JAWS Desktop release config is not ready:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("JAWS Desktop release config is ready.");
