import { spawn } from "child_process";
import http from "http";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HEALTH_CHECK_INTERVAL = 15 * 1000;
const UNHEALTHY_THRESHOLD_MS = 20 * 60 * 1000;
const STARTUP_GRACE_PERIOD_MS = 60 * 1000;
const RESTART_BACKOFF_BASE_MS = 2000;
const MAX_RESTART_BACKOFF_MS = 60 * 1000;
const HEALTH_TIMEOUT_MS = 5000;

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    envFile: null,
    script: "dist/server.js",
    port: 3000,
  };

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--env" || args[i] === "-e") && args[i + 1]) {
      result.envFile = args[i + 1];
      i++;
    } else if ((args[i] === "--port" || args[i] === "-p") && args[i + 1]) {
      result.port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--script" && args[i + 1]) {
      result.script = args[i + 1];
      i++;
    }
  }

  if (result.envFile) {
    try {
      const envPath = resolve(
        result.envFile.endsWith(".env")
          ? result.envFile
          : `.env.${result.envFile}`,
      );
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf-8");
        const portMatch = envContent.match(/^SERVER_PORT=(\d+)/m);
        if (portMatch) {
          result.port = parseInt(portMatch[1], 10);
        }
      }
    } catch (e) {
      // ignore
    }
  }

  return result;
}

const opts = parseArgs();
const tag = opts.envFile ? `[watchdog:${opts.envFile}]` : "[watchdog]";
const scriptPath = resolve(__dirname, opts.script);

let child = null;
let restartCount = 0;
let lastHealthyAt = Date.now();
let startedAt = Date.now();
let stopping = false;
let healthCheckTimer = null;

function log(...args) {
  const ts = new Date().toISOString();
  console.log(`${ts} ${tag}`, ...args);
}

function getHealthUrl() {
  return `http://127.0.0.1:${opts.port}/health`;
}

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(getHealthUrl(), { timeout: HEALTH_TIMEOUT_MS }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            if (json.status === "ok") {
              resolve(true);
              return;
            }
          } catch (_) {}
        }
        resolve(false);
      });
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function getRestartDelay() {
  const delay = Math.min(
    RESTART_BACKOFF_BASE_MS * Math.pow(2, Math.min(restartCount, 8)),
    MAX_RESTART_BACKOFF_MS,
  );
  return delay;
}

function spawnChild() {
  if (stopping) return;

  const args = ["--enable-source-maps", scriptPath];
  if (opts.envFile) {
    args.push("--env", opts.envFile);
  }

  log(`Spawning bridge: node ${args.slice(1).join(" ")}`);

  child = spawn("node", args, {
    stdio: "inherit",
    env: { ...process.env },
  });

  startedAt = Date.now();
  lastHealthyAt = Date.now();

  child.on("exit", (code, signal) => {
    log(`Bridge exited (code=${code}, signal=${signal})`);
    child = null;

    if (stopping) return;

    restartCount++;
    const delay = getRestartDelay();
    log(`Restarting in ${delay / 1000}s (attempt #${restartCount})...`);

    setTimeout(() => {
      spawnChild();
    }, delay);
  });

  child.on("error", (err) => {
    log(`Spawn error:`, err);
    child = null;
  });
}

async function healthCheckLoop() {
  if (stopping) return;

  const now = Date.now();
  const uptime = now - startedAt;

  const healthy = await checkHealth();

  if (healthy) {
    lastHealthyAt = now;
    if (restartCount > 0) {
      restartCount = 0;
      log("Health recovered, reset restart counter");
    }
  } else {
    const unhealthyFor = now - lastHealthyAt;
    if (uptime < STARTUP_GRACE_PERIOD_MS) {
      log(`Unhealthy (startup grace: ${Math.ceil((STARTUP_GRACE_PERIOD_MS - uptime) / 1000)}s left)`);
    } else if (unhealthyFor >= UNHEALTHY_THRESHOLD_MS) {
      log(
        `Unhealthy for ${Math.round(unhealthyFor / 60000)} minutes, threshold=${UNHEALTHY_THRESHOLD_MS / 60000}min. Forcing restart...`,
      );
      if (child) {
        log("Killing bridge process...");
        child.kill("SIGTERM");
        setTimeout(() => {
          if (child) child.kill("SIGKILL");
        }, 5000);
      }
      lastHealthyAt = now;
    } else {
      log(
        `Unhealthy for ${Math.round(unhealthyFor / 1000)}s, will restart after ${Math.round((UNHEALTHY_THRESHOLD_MS - unhealthyFor) / 60000)}min`,
      );
    }
  }
}

function startHealthCheck() {
  if (healthCheckTimer) clearInterval(healthCheckTimer);
  healthCheckTimer = setInterval(healthCheckLoop, HEALTH_CHECK_INTERVAL);
  healthCheckLoop();
}

function shutdown() {
  stopping = true;
  log("Shutting down watchdog...");
  if (healthCheckTimer) clearInterval(healthCheckTimer);
  if (child) {
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child) child.kill("SIGKILL");
      process.exit(0);
    }, 3000);
  } else {
    process.exit(0);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

log(`===== ClawChat Bridge Watchdog =====`);
log(`Target script: ${scriptPath}`);
log(`Health check: ${getHealthUrl()}`);
log(`Health check interval: ${HEALTH_CHECK_INTERVAL / 1000}s`);
log(`Unhealthy restart threshold: ${UNHEALTHY_THRESHOLD_MS / 60000}min`);
log(`Startup grace period: ${STARTUP_GRACE_PERIOD_MS / 1000}s`);
if (opts.envFile) log(`Environment: ${opts.envFile}`);
log("");

spawnChild();
startHealthCheck();
