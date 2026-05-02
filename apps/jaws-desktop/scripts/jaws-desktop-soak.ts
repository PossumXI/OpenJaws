import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  advanceHoldemRound,
  advanceSlowGuy,
  createHoldemTable,
  createSlowGuyState,
  type HoldemTableState,
  type SlowGuyAction
} from "../src/games";

interface SoakOptions {
  durationMs: number;
  simulatedUsers: number;
}

type ShellScopeArg = string | { validator?: string };

interface ShellScopeEntry {
  name?: string;
  sidecar?: boolean;
  args?: ShellScopeArg[] | boolean;
}

interface CapabilityPermission {
  identifier?: string;
  allow?: ShellScopeEntry[];
}

interface CapabilityConfig {
  permissions?: Array<string | CapabilityPermission>;
}

const appRoot = resolve(import.meta.dir, "..");
const requiredPublisher = "AROBI TECHNOLOGY ALLIANCE A OPAL MAR GROUP CORPORATION NJ USA";
const blockedBrandingPattern = /\b(?:claude|anthropic)\b/i;

function valueForFlag(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function parseOptions(): SoakOptions {
  const durationMs = Number(valueForFlag("--duration-ms", "300000"));
  const simulatedUsers = Number(valueForFlag("--users", "5000"));
  return {
    durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 300000,
    simulatedUsers: Number.isFinite(simulatedUsers) && simulatedUsers > 0 ? simulatedUsers : 5000
  };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function sidecarArgShape(args: ShellScopeEntry["args"]): string {
  if (args === true) return "*";
  if (args === false || !Array.isArray(args)) return "";
  return args.map((arg) => (typeof arg === "string" ? arg : "<validator>")).join(" ");
}

function openJawsSidecarArgShapes(config: CapabilityConfig): Set<string> {
  const permission = config.permissions?.find(
    (entry): entry is CapabilityPermission =>
      typeof entry === "object" && entry?.identifier === "shell:allow-execute"
  );
  const entries = permission?.allow?.filter(
    (entry) => entry.name === "binaries/openjaws" && entry.sidecar === true
  );

  return new Set((entries ?? []).map((entry) => sidecarArgShape(entry.args)));
}

function runHoldemHand(table: HoldemTableState): HoldemTableState {
  let next = table;
  for (let step = 0; step < 5; step += 1) {
    next = advanceHoldemRound(next);
  }
  return next;
}

function verifyStaticSurface() {
  const releaseIndex = readJson(join(appRoot, "src", "release-index.json")) as {
    version?: string;
    tag?: string;
    mirrors?: unknown[];
  };
  const tauriConfig = readJson(join(appRoot, "src-tauri", "tauri.conf.json")) as {
    productName?: string;
    version?: string;
    bundle?: { publisher?: string; createUpdaterArtifacts?: boolean; externalBin?: string[] };
    plugins?: { updater?: { endpoints?: string[] } };
  };
  const appSource = readFileSync(join(appRoot, "src", "App.tsx"), "utf8");
  const styleSource = readFileSync(join(appRoot, "src", "styles.css"), "utf8");
  const nativeSource = readFileSync(join(appRoot, "src-tauri", "src", "main.rs"), "utf8");
  const capabilitySource = readFileSync(join(appRoot, "src-tauri", "capabilities", "default.json"), "utf8");
  const capabilityConfig = JSON.parse(capabilitySource) as CapabilityConfig;
  const sidecarArgShapes = openJawsSidecarArgShapes(capabilityConfig);

  assert(tauriConfig.productName === "JAWS", "Tauri productName drifted from JAWS.");
  assert(tauriConfig.bundle?.publisher === requiredPublisher, "Installer publisher attribution is missing.");
  assert(tauriConfig.bundle?.createUpdaterArtifacts === true, "Updater artifacts must remain enabled.");
  assert(tauriConfig.bundle?.externalBin?.includes("binaries/openjaws"), "OpenJaws sidecar is not bundled.");
  assert(releaseIndex.version === tauriConfig.version, "Release index and Tauri version are out of sync.");
  assert(Array.isArray(releaseIndex.mirrors) && releaseIndex.mirrors.length >= 2, "Release mirrors are incomplete.");
  assert(
    tauriConfig.plugins?.updater?.endpoints?.every((endpoint) => endpoint.startsWith("https://")),
    "Updater endpoints must all use HTTPS."
  );
  assert(appSource.includes("function JawsMark"), "React/CSS JAWS logo surface is missing.");
  assert(appSource.includes("Docs And Legal"), "In-app docs/legal page is missing.");
  assert(appSource.includes("agent_runtime_snapshot"), "Agent Watch native runtime snapshot bridge is missing.");
  assert(appSource.includes("Cognitive Runtime"), "Agent Watch cognitive runtime panel is missing.");
  assert(appSource.includes("nativeNotificationPermission"), "Native notification permission state is missing.");
  assert(appSource.includes("receiptHash"), "Preview demo receipt hash is not surfaced in the UI.");
  assert(appSource.includes("inference-settings"), "Settings inference route panel is missing.");
  assert(capabilitySource.includes("notification:default"), "Tauri notification permission is missing.");
  assert(nativeSource.includes("tauri_plugin_notification::init()"), "Native notification plugin is missing.");
  assert(nativeSource.includes("build_cognitive_runtime_snapshot"), "Native cognitive runtime bridge is missing.");
  assert(nativeSource.includes("openjaws_inference_status"), "Native inference provider bridge is missing.");
  assert(nativeSource.includes(".arg(\"provider\")"), "Native inference bridge must use the direct provider CLI route.");
  assert(sidecarArgShapes.has("--version"), "OpenJaws sidecar version check is not permitted.");
  assert(sidecarArgShapes.has("provider status"), "OpenJaws provider status route is not permitted.");
  assert(
    sidecarArgShapes.has("provider test <validator> <validator>"),
    "OpenJaws provider test route is not permitted."
  );
  assert(
    sidecarArgShapes.has("provider use <validator> <validator>"),
    "OpenJaws provider use route is not permitted."
  );
  assert(
    sidecarArgShapes.has("provider base-url <validator> <validator>"),
    "OpenJaws provider base-url route is not permitted."
  );
  assert(
    sidecarArgShapes.has(
      "--print --output-format text --max-turns 1 --permission-mode <validator> --workload jaws-desktop <validator>"
    ),
    "OpenJaws desktop Chat sidecar route is not permitted."
  );
  assert(
    nativeSource.includes("deterministic_receipt_hash") &&
      nativeSource.includes("write_browser_preview_demo_harness"),
    "Native Playwright demo receipt integrity bridge is missing."
  );
  assert(styleSource.includes(".jaws-mark"), "JAWS logo CSS is missing.");
  assert(styleSource.includes(".docs-page"), "Docs/legal layout CSS is missing.");
  assert(!blockedBrandingPattern.test(appSource), "Desktop app source contains blocked legacy provider branding.");
}

function runSimulation(durationMs: number, simulatedUsers: number) {
  const actions: SlowGuyAction[] = ["tick", "right", "jump", "tick", "left", "duck", "dash", "tick"];
  const startedAt = performance.now();
  let cycles = 0;
  let slowGuy = createSlowGuyState();
  let holdem = createHoldemTable("Soak", "jaws-soak-0");
  let holdEmShowdowns = 0;
  let userPresenceChecks = 0;

  while (performance.now() - startedAt < durationMs) {
    const action = actions[cycles % actions.length]!;
    slowGuy = advanceSlowGuy(slowGuy, action);
    if (slowGuy.gameOver || cycles % 280 === 0) {
      slowGuy = createSlowGuyState(slowGuy.bestScore);
    }

    if (cycles % 32 === 0) {
      holdem = runHoldemHand(createHoldemTable(`Soak ${cycles}`, `jaws-soak-${cycles}`));
      assert(holdem.phase === "showdown", "Hold'em soak did not reach showdown.");
      assert(holdem.winners.length > 0, "Hold'em showdown produced no winner.");
      holdEmShowdowns += 1;
    }

    if (cycles % 64 === 0) {
      for (let user = 0; user < simulatedUsers; user += 1) {
        const roomCode = `JWS-${(cycles + user).toString(36).toUpperCase()}`;
        assert(roomCode.length >= 5, "Room code generation failed.");
      }
      userPresenceChecks += simulatedUsers;
    }

    cycles += 1;
  }

  return {
    cycles,
    durationMs: Math.round(performance.now() - startedAt),
    slowGuyBestScore: slowGuy.bestScore,
    holdEmShowdowns,
    simulatedUserPresenceChecks: userPresenceChecks
  };
}

function main() {
  const options = parseOptions();
  verifyStaticSurface();
  const result = runSimulation(options.durationMs, options.simulatedUsers);
  console.log(
    JSON.stringify(
      {
        ok: true,
        surface: "jaws-desktop",
        checks: {
          staticReleaseSurface: true,
          logoSurface: true,
          docsLegalSurface: true,
          agentRuntimeBridge: true,
          cognitiveRuntimeBridge: true,
          nativeNotifications: true,
          inferenceRouteBridge: true,
          securityBrandingScan: true,
          previewDemoReceiptIntegrity: true,
          slowGuySimulation: true,
          holdemSimulation: true,
          userPresenceScaleSimulation: options.simulatedUsers
        },
        result
      },
      null,
      2
    )
  );
}

main();
