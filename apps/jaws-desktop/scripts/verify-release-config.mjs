import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const tauriRoot = join(appRoot, "src-tauri");
const configPath = join(tauriRoot, "tauri.conf.json");
const packagePath = join(appRoot, "package.json");
const iconPath = join(tauriRoot, "icons", "icon.ico");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const config = readJson(configPath);
const pkg = readJson(packagePath);
const updater = config.plugins?.updater ?? {};
const errors = [];

function require(condition, message) {
  if (!condition) errors.push(message);
}

const publicKey = String(process.env.JAWS_TAURI_UPDATER_PUBLIC_KEY || updater.pubkey || "").trim();
const endpoints = Array.isArray(updater.endpoints) ? updater.endpoints : [];

require(config.productName === "JAWS", "Tauri productName must remain JAWS.");
require(pkg.version === config.version, "Desktop package version and Tauri app version must match.");
require(config.bundle?.createUpdaterArtifacts === true, "bundle.createUpdaterArtifacts must be true for live updates.");
require(config.bundle?.externalBin?.includes("binaries/openjaws"), "OpenJaws sidecar must be listed in bundle.externalBin.");
require(publicKey.length >= 40, "Set JAWS_TAURI_UPDATER_PUBLIC_KEY or tauri.conf updater.pubkey before release.");
require(endpoints.length >= 2, "Updater must keep both qline.site and iorch.net endpoints.");
require(endpoints.every((endpoint) => endpoint.startsWith("https://")), "Updater endpoints must use HTTPS.");
require(endpoints.some((endpoint) => endpoint.includes("qline.site")), "Updater endpoints must include qline.site.");
require(endpoints.some((endpoint) => endpoint.includes("iorch.net")), "Updater endpoints must include iorch.net.");
require(existsSync(iconPath) && statSync(iconPath).size > 1024, "Native Windows icon must exist at src-tauri/icons/icon.ico.");

if (errors.length > 0) {
  console.error("JAWS Desktop release config is not ready:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("JAWS Desktop release config is ready.");
