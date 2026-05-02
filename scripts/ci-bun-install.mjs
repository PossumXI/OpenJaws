import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

function readArgs(argv) {
  const options = {
    cwd: process.cwd(),
    attempts: 3,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--cwd") {
      options.cwd = resolve(argv[index + 1] ?? ".");
      index += 1;
    } else if (arg === "--attempts") {
      options.attempts = Number(argv[index + 1] ?? "3");
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isInteger(options.attempts) || options.attempts < 1 || options.attempts > 5) {
    throw new Error("--attempts must be an integer between 1 and 5.");
  }
  if (!existsSync(options.cwd)) {
    throw new Error(`Install cwd does not exist: ${options.cwd}`);
  }
  return options;
}

function sleep(ms) {
  return new Promise(resolveSleep => setTimeout(resolveSleep, ms));
}

async function main() {
  const options = readArgs(process.argv.slice(2));
  let lastStatus = 1;

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    console.log(`bun install attempt ${attempt}/${options.attempts} in ${options.cwd}`);
    const result = spawnSync("bun", ["install", "--frozen-lockfile"], {
      cwd: options.cwd,
      env: process.env,
      shell: process.platform === "win32",
      stdio: "inherit",
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status === 0) {
      return;
    }

    lastStatus = result.status ?? 1;
    if (attempt < options.attempts) {
      const delayMs = 15_000 * attempt;
      console.warn(`bun install failed with exit code ${lastStatus}; retrying in ${delayMs / 1000}s.`);
      await sleep(delayMs);
    }
  }

  process.exit(lastStatus);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
