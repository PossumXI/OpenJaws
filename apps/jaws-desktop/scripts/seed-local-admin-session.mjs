import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const adminReceiptPath = join(repoRoot, "website", ".data", "jaws-admin.local.json");

function appConfigDir() {
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(process.env.USERPROFILE ?? repoRoot, "AppData", "Roaming"), "site.qline.jaws");
  }
  if (process.platform === "darwin") {
    return join(process.env.HOME ?? repoRoot, "Library", "Application Support", "site.qline.jaws");
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(process.env.HOME ?? repoRoot, ".config"), "site.qline.jaws");
}

if (!existsSync(adminReceiptPath)) {
  throw new Error(`Local founder admin receipt not found at ${adminReceiptPath}. Run bun run jaws:admin:bootstrap first.`);
}

const receipt = JSON.parse(readFileSync(adminReceiptPath, "utf8"));
if (!receipt.email) {
  throw new Error(`Local founder admin receipt at ${adminReceiptPath} does not contain an email.`);
}

const session = {
  email: String(receipt.email).trim(),
  role: String(receipt.role ?? "founder_admin").trim(),
  plan: String(receipt.plan ?? "admin_free_life").trim(),
  status: "signed_in",
  savedAt: new Date().toISOString(),
  source: "local_founder_admin",
  displayName: String(receipt.displayName ?? receipt.email.split("@")[0]).trim()
};

const outPath = join(appConfigDir(), "jaws-local-session.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");

console.log(`Seeded local JAWS desktop admin session at ${outPath}`);
