import { config as dotenvConfig } from "dotenv";
import { randomBytes } from "crypto";
import { DEFAULT_BASE_URL, DEFAULT_WEBSOCKET_URL } from "./types.js";
import type { BridgeConfig } from "./types.js";
import { existsSync } from "fs";
import { resolve } from "path";

function resolveEnvPath(): string | null {
  const argIdx = process.argv.findIndex((a) => a === "--env" || a === "-e");
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    const argPath = process.argv[argIdx + 1];
    return resolve(argPath.endsWith(".env") ? argPath : `.env.${argPath}`);
  }
  if (process.env.BRIDGE_ENV) {
    const envName = process.env.BRIDGE_ENV;
    return resolve(envName.endsWith(".env") ? envName : `.env.${envName}`);
  }
  return null;
}

const customEnvPath = resolveEnvPath();
if (customEnvPath) {
  if (existsSync(customEnvPath)) {
    dotenvConfig({ path: customEnvPath });
    console.log(`[Config] Loaded env: ${customEnvPath}`);
  } else {
    console.warn(`[Config] Env file not found: ${customEnvPath}, falling back to .env`);
    dotenvConfig();
  }
} else {
  dotenvConfig();
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function resolveInstanceName(): string {
  const envName = process.env.BRIDGE_INSTANCE || process.env.BRIDGE_ENV || "";
  if (envName) return envName;
  const argIdx = process.argv.findIndex((a) => a === "--env" || a === "-e");
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    return process.argv[argIdx + 1].replace(/\.env$/, "");
  }
  return "default";
}

function getOrCreateDeviceId(): string {
  const existing = process.env.CLAWCHAT_DEVICE_ID;
  if (existing && existing.trim()) return existing.trim();
  const generated = `dev_${randomBytes(12).toString("hex")}`;
  return generated;
}

export const config: BridgeConfig = {
  clawchat: {
    baseUrl: process.env.CLAWCHAT_BASE_URL || DEFAULT_BASE_URL,
    websocketUrl: process.env.CLAWCHAT_WEBSOCKET_URL || DEFAULT_WEBSOCKET_URL,
    mediaUploadUrl:
      process.env.CLAWCHAT_MEDIA_UPLOAD_URL ||
      `${process.env.CLAWCHAT_BASE_URL || DEFAULT_BASE_URL}/media/upload`,
    accessToken: process.env.CLAWCHAT_ACCESS_TOKEN || "",
    refreshToken: process.env.CLAWCHAT_REFRESH_TOKEN || null,
    agentId: process.env.CLAWCHAT_AGENT_ID || "",
    ownerUserId: process.env.CLAWCHAT_OWNER_USER_ID || "",
    deviceId: getOrCreateDeviceId(),
  },
  llm: {
    provider: (process.env.LLM_PROVIDER as BridgeConfig["llm"]["provider"]) || "doubao",
    apiKey: process.env.LLM_API_KEY || "",
    model: process.env.LLM_MODEL || "doubao-seed-1.6",
    apiBase: process.env.LLM_API_BASE || undefined,
  },
  security: {
    dmPolicy: (process.env.DM_POLICY as BridgeConfig["security"]["dmPolicy"]) || "all",
    dmAllowlist: parseList(process.env.DM_ALLOWLIST),
    groupAllowlist: parseList(process.env.GROUP_ALLOWLIST),
    requireMentionInGroup: process.env.REQUIRE_MENTION_IN_GROUP !== "false",
  },
  server: {
    port: parseInt(process.env.PORT || "3000", 10),
    host: process.env.HOST || "0.0.0.0",
    contextWindow: parseInt(process.env.CONTEXT_WINDOW || "20", 10),
    instanceName: resolveInstanceName(),
  },
};

export function validateConfig(): string[] {
  const errors: string[] = [];
  if (!config.clawchat.accessToken) {
    errors.push(
      "CLAWCHAT_ACCESS_TOKEN is required. Run `npm run activate YOUR_CODE` first.",
    );
  }
  if (!config.llm.apiKey) errors.push("LLM_API_KEY is required");
  return errors;
}
