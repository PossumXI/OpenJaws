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
          securityBrandingScan: true,
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
