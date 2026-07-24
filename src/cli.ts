import { randomBytes } from "crypto";
import { config } from "./config.js";
import { ClawChatRestClient, normalizeActivationResult } from "./api-client.js";

function envValue(key: string, value: string | null): string {
  if (value === null || value === undefined) return `# ${key}=`;
  return `${key}=${value}`;
}

async function activate(code: string): Promise<void> {
  const deviceId = config.clawchat.deviceId || `dev_${randomBytes(12).toString("hex")}`;
  console.log(`[Activate] Device ID: ${deviceId}`);
  console.log(`[Activate] Calling ${config.clawchat.baseUrl}/v1/agents/connect ...`);

  const client = new ClawChatRestClient(config.clawchat.baseUrl, deviceId);
  const raw = await client.agentsConnect(code, config.clawchat.ownerUserId || undefined);
  const result = normalizeActivationResult(raw);

  console.log("\n[Activate] Success! Save these values to your .env file:\n");
  console.log(envValue("CLAWCHAT_ACCESS_TOKEN", result.accessToken));
  if (result.refreshToken) console.log(envValue("CLAWCHAT_REFRESH_TOKEN", result.refreshToken));
  console.log(envValue("CLAWCHAT_DEVICE_ID", deviceId));
  if (result.serverAgentId) console.log(envValue("CLAWCHAT_AGENT_ID", result.serverAgentId));
  if (result.userId) console.log(envValue("CLAWCHAT_OWNER_USER_ID", result.userId));
  if (result.conversationId) {
    console.log(`# Your direct conversation ID: ${result.conversationId}`);
  }

  console.log("\n[Activate] Done. Now run `npm start` to launch the bridge.");
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node dist/cli.js activate YOUR_INVITE_CODE");
  process.exit(1);
}

if (args[0] === "activate" && args[1]) {
  activate(args[1]).catch((err) => {
    console.error("Activation failed:", err.message);
    process.exit(1);
  });
} else {
  console.error("Unknown command. Usage: node dist/cli.js activate YOUR_CODE");
  process.exit(1);
}
