import WebSocket from "ws";
import { getWsOptions } from "./proxy.js";
import {
  EVENT,
  type ConnState,
  type Envelope,
  type ChallengePayload,
  type ConnectPayload,
  type ConnectCapabilities,
  type HelloOkPayload,
  type MessagePayload,
  type MessageAckPayload,
} from "./types.js";
import { createEnvelope, parseEnvelope, serializeEnvelope } from "./protocol.js";

export interface ClawChatWsClientOptions {
  websocketUrl: string;
  accessToken: string;
  deviceId: string;
  capabilities?: ConnectCapabilities;
}

export type InboundHandler = (envelope: Envelope) => void | Promise<void>;

export class ClawChatWsClient {
  private url: string;
  private accessToken: string;
  private deviceId: string;
  private capabilities: ConnectCapabilities;
  private ws: WebSocket | null = null;
  private state: ConnState = "idle";
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private pendingAcks = new Map<string, (ack: MessageAckPayload) => void>();
  private handlers: InboundHandler[] = [];

  constructor(options: ClawChatWsClientOptions) {
    this.url = options.websocketUrl;
    this.accessToken = options.accessToken;
    this.deviceId = options.deviceId;
    this.capabilities = options.capabilities || {
      multi_device: true,
      delivery_receipt: true,
      notify_signals: true,
      permission_events: true,
    };
  }

  getState(): ConnState {
    return this.state;
  }

  onInbound(handler: InboundHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  async connect(): Promise<void> {
    if (this.state === "connected" || this.state === "connecting") {
      return;
    }
    this.state = "connecting";
    this.clearReconnect();

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url, {
          handshakeTimeout: 10000,
          ...getWsOptions(),
        });
      } catch (err) {
        this.state = "disconnected";
        reject(err);
        return;
      }

      const onOpen = () => {
        this.state = "challenging";
        console.log("[WS] Connected, waiting for challenge...");
      };

      const onMessage = async (data: WebSocket.Data) => {
        try {
          const envelope = parseEnvelope(data.toString());
          await this.handleEnvelope(envelope, resolve, reject);
        } catch (err) {
          console.error("[WS] Parse error:", err);
        }
      };

      const onError = (err: Error) => {
        console.error("[WS] Error:", err.message);
        if (this.state !== "connected") {
          reject(err);
        }
        this.scheduleReconnect();
      };

      const onClose = (code: number, reason: string) => {
        console.log(`[WS] Closed: code=${code} reason=${reason}`);
        this.stopHeartbeat();
        if (this.state === "connected") {
          this.state = "reconnecting";
          this.scheduleReconnect();
        } else {
          this.state = "disconnected";
        }
      };

      this.ws.on("open", onOpen);
      this.ws.on("message", onMessage);
      this.ws.on("error", onError);
      this.ws.on("close", onClose);
    });
  }

  private async handleEnvelope(
    envelope: Envelope,
    resolve: () => void,
    reject: (err: Error) => void,
  ): Promise<void> {
    switch (envelope.event) {
      case EVENT.CONNECT_CHALLENGE: {
        const challenge = envelope.payload as ChallengePayload;
        console.log("[WS] Received challenge, sending connect...");
        this.state = "authenticating";
        const connectPayload: ConnectPayload = {
          token: this.accessToken,
          nonce: challenge.nonce,
          device_id: this.deviceId,
          capabilities: this.capabilities,
        };
        this.sendRaw(
          createEnvelope(EVENT.CONNECT, connectPayload, {
            target_device_id: envelope.origin_device_id,
          }),
        );
        break;
      }

      case EVENT.HELLO_OK: {
        const hello = envelope.payload as HelloOkPayload;
        console.log(`[WS] Hello OK! device_id=${hello.device_id} ack_epoch=${hello.ack_epoch}`);
        this.state = "connected";
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        resolve();
        break;
      }

      case EVENT.HELLO_FAIL: {
        const fail = envelope.payload as { reason: string };
        console.error(`[WS] Hello failed: ${fail.reason}`);
        this.state = "disconnected";
        reject(new Error(`Authentication failed: ${fail.reason}`));
        break;
      }

      case EVENT.MESSAGE_ACK: {
        const ack = envelope.payload as MessageAckPayload;
        const resolver = this.pendingAcks.get(ack.message_id);
        if (resolver) {
          resolver(ack);
          this.pendingAcks.delete(ack.message_id);
        }
        break;
      }

      case EVENT.MESSAGE_ERROR: {
        const err = envelope.payload as { message_id?: string; code: string; reason?: string };
        console.error(`[WS] Message error: ${err.code} ${err.reason || ""}`);
        break;
      }

      case EVENT.PING: {
        this.sendRaw(createEnvelope(EVENT.PONG, {}));
        break;
      }

      case EVENT.PONG: {
        break;
      }

      default: {
        for (const handler of this.handlers) {
          try {
            await handler(envelope);
          } catch (err) {
            console.error("[WS] Handler error:", err);
          }
        }
      }
    }
  }

  async sendMessage(
    chatId: string,
    chatType: "direct" | "group",
    payload: MessagePayload,
    timeoutMs = 120000,
  ): Promise<string> {
    const envelope = createEnvelope(EVENT.MESSAGE_SEND, payload, {
      chat_id: chatId,
      chat_type: chatType,
    });

    const messageId = envelope.payload.message_id || envelope.trace_id;

    const ackPromise = new Promise<string>((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingAcks.delete(messageId);
        resolve(messageId);
      }, timeoutMs);

      this.pendingAcks.set(messageId, (ack) => {
        clearTimeout(timeout);
        resolve(ack.message_id);
      });
    });

    this.sendRaw(envelope);
    return ackPromise;
  }

  async sendTyping(chatId: string, isTyping: boolean): Promise<void> {
    this.sendRaw(
      createEnvelope(
        EVENT.TYPING_UPDATE,
        { is_typing: isTyping },
        { chat_id: chatId },
      ),
    );
  }

  private sendRaw(envelope: Envelope): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    this.ws.send(serializeEnvelope(envelope));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.state === "connected" && this.ws?.readyState === WebSocket.OPEN) {
        this.sendRaw(createEnvelope(EVENT.PING, {}));
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnect();
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[WS] Max reconnect attempts reached, giving up");
      this.state = "disconnected";
      return;
    }
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 60000);
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().catch((err) => {
        console.error("[WS] Reconnect failed:", err.message);
      });
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  disconnect(): void {
    this.clearReconnect();
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, "Client disconnecting");
      this.ws = null;
    }
    this.state = "disconnected";
  }
}
