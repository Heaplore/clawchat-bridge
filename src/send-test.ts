import "dotenv/config";
import { ClawChatWsClient } from "./ws-client.js";
import { buildMessagePayload } from "./protocol.js";

const chatId = process.argv[2] || "cnv_01KY9J72TAE3A936N090JB4HCV";
const text = process.argv.slice(3).join(" ") || "🤖 测试消息：Bridge 服务已上线！我是你的 ClawChat Agent，通过 WebSocket 主动发送消息测试。";

async function main() {
  const ws = new ClawChatWsClient({
    websocketUrl: process.env.CLAWCHAT_WEBSOCKET_URL || "wss://app.clawling.com/ws",
    accessToken: process.env.CLAWCHAT_ACCESS_TOKEN || "",
    deviceId: process.env.CLAWCHAT_DEVICE_ID || "",
  });

  console.log(`[Send] Connecting...`);
  await ws.connect();
  console.log(`[Send] Connected, sending to ${chatId} ...`);

  const payload = buildMessagePayload(text);
  const msgId = await ws.sendMessage(chatId, "direct", payload);
  console.log(`[Send] Done! message_id=${msgId}`);

  ws.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("[Send] Failed:", err.message);
  process.exit(1);
});
