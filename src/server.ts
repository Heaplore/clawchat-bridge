import http from "http";
import { config, validateConfig } from "./config.js";
import { ClawChatWsClient } from "./ws-client.js";
import { createLLMProvider } from "./llm.js";
import { Bridge } from "./bridge.js";

function createHealthServer(): http.Server {
  return http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", ts: Date.now() }));
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  });
}

async function main(): Promise<void> {
  const errors = validateConfig();
  if (errors.length > 0) {
    console.error("Configuration errors:");
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  const instanceName = config.server.instanceName;
  console.log(`\n[${instanceName}] ===== Starting ClawChat Bridge =====`);

  const healthServer = createHealthServer();
  healthServer.listen(config.server.port, config.server.host, () => {
    console.log(`[${instanceName}] Health check on http://${config.server.host}:${config.server.port}/health`);
  });

  const ws = new ClawChatWsClient({
    websocketUrl: config.clawchat.websocketUrl,
    accessToken: config.clawchat.accessToken,
    deviceId: config.clawchat.deviceId,
  });

  const llm = createLLMProvider(
    config.llm.provider,
    config.llm.apiKey,
    config.llm.model,
    config.llm.apiBase,
  );

  const bridge = new Bridge(config, ws, llm);
  bridge.start();

  console.log(`[${instanceName}] Connecting to ${config.clawchat.websocketUrl} ...`);
  try {
    await ws.connect();
    console.log(`[${instanceName}] Ready - listening for messages via WebSocket\n`);
  } catch (err) {
    console.error(`[${instanceName}] Failed to connect:`, err);
    process.exit(1);
  }

  process.on("SIGINT", () => {
    console.log(`\n[${instanceName}] Shutting down...`);
    ws.disconnect();
    healthServer.close();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    ws.disconnect();
    healthServer.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
