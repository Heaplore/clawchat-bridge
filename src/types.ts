export const DEFAULT_BASE_URL = "https://app.clawling.com";
export const DEFAULT_WEBSOCKET_URL = "wss://app.clawling.com/ws";
export const PLATFORM_ID = "clawchat-bridge";
export const AGENT_TYPE = "clawbot";
export const PROTOCOL_VERSION = "2";

export const EVENT = {
  CONNECT_CHALLENGE: "connect.challenge",
  CONNECT: "connect",
  HELLO_OK: "hello-ok",
  HELLO_FAIL: "hello-fail",
  MESSAGE_SEND: "message.send",
  MESSAGE_ACK: "message.ack",
  MESSAGE_ERROR: "message.error",
  MESSAGE_DELIVERED: "message.delivered",
  MESSAGE_REPLY: "message.reply",
  MESSAGE_CREATED: "message.created",
  MESSAGE_ADD: "message.add",
  MESSAGE_DONE: "message.done",
  MESSAGE_FAILED: "message.failed",
  TYPING_UPDATE: "typing.update",
  PING: "ping",
  PONG: "pong",
} as const;

export type EventName = string;
export type ChatType = "direct" | "group";
export type ConnState =
  | "idle"
  | "connecting"
  | "challenging"
  | "authenticating"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type Fragment =
  | { kind: "text"; text: string; delta?: string }
  | { kind: "mention"; user_id?: string; display?: string }
  | { kind: "image"; url: string; name?: string; mime?: string; size?: number }
  | { kind: "file"; url: string; name?: string; mime?: string; size?: number }
  | { kind: "audio"; url: string; name?: string; mime?: string; size?: number; duration?: number }
  | { kind: "video"; url: string; name?: string; mime?: string; size?: number }
  | { kind: string; [field: string]: unknown };

export interface Routing {
  id: string;
  type: string;
}

export interface Sender {
  id: string;
  type: "direct";
  nick_name: string;
}

export interface Envelope<TPayload = unknown> {
  version: "2";
  event: EventName;
  trace_id: string;
  emitted_at: number;
  chat_id?: string;
  chat_type?: ChatType;
  to?: Routing;
  sender?: Sender;
  origin_device_id?: string;
  target_device_id?: string;
  payload: TPayload;
}

export interface ConnectCapabilities {
  multi_device?: boolean;
  device_replay?: boolean;
  delivery_receipt?: boolean;
  notify_signals?: boolean;
}

export interface ChallengePayload {
  nonce: string;
}

export interface ConnectPayload {
  token: string;
  nonce: string;
  device_id?: string;
  capabilities?: ConnectCapabilities;
}

export interface HelloOkPayload {
  device_id?: string;
  ack_mode: "dseq";
  ack_epoch: string;
}

export interface MessageAckPayload {
  message_id: string;
  accepted_at: number;
}

export interface MessageContext {
  mentions: unknown[];
  reply: { reply_to_msg_id: string; reply_preview: { id: string; nick_name: string; fragments: Fragment[] } | null } | null;
}

export interface MessagePayload {
  message_id?: string;
  message_mode: string;
  message: {
    body: { fragments: Fragment[] };
    context: MessageContext;
    streaming?: { status: string; sequence: number; mutation_policy: string; started_at?: number | null; completed_at?: number | null };
  };
}

export interface TypingUpdatePayload {
  is_typing: boolean;
}

export interface NormalizedInboundMessage {
  event: "message.send" | "message.reply";
  chatId: string;
  chatType: ChatType;
  messageId: string;
  traceId: string;
  sender: Sender;
  emittedAt: number;
  text: string;
  fragments: Fragment[];
  mentions: string[];
  replyToMessageId: string | null;
  raw: Envelope<MessagePayload>;
}

export interface ActivationResult {
  accessToken: string;
  refreshToken: string | null;
  serverAgentId: string | null;
  userId: string;
  ownerUserId: string;
  conversationId: string | null;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMProvider {
  id: string;
  chat(messages: LLMMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<string>;
}

export interface Session {
  id: string;
  conversationId: string;
  chatType: ChatType;
  messages: LLMMessage[];
  lastActive: number;
}

export interface BridgeConfig {
  clawchat: {
    baseUrl: string;
    websocketUrl: string;
    mediaUploadUrl: string;
    accessToken: string;
    refreshToken: string | null;
    agentId: string;
    ownerUserId: string;
    deviceId: string;
  };
  llm: {
    provider: "doubao" | "deepseek" | "openai-compatible";
    apiKey: string;
    model: string;
    apiBase?: string;
  };
  security: {
    dmPolicy: "allowlist" | "blocklist" | "all";
    dmAllowlist: string[];
    groupAllowlist: string[];
    requireMentionInGroup: boolean;
  };
  server: {
    port: number;
    host: string;
    contextWindow: number;
    instanceName: string;
  };
}
