import { randomUUID } from "crypto";
import type {
  Envelope,
  Fragment,
  MessagePayload,
  NormalizedInboundMessage,
  PROTOCOL_VERSION,
} from "./types.js";

export function generateTraceId(): string {
  return randomUUID();
}

export function createEnvelope<T>(
  event: string,
  payload: T,
  extras: Partial<Envelope> = {},
): Envelope<T> {
  return {
    version: "2",
    event,
    trace_id: generateTraceId(),
    emitted_at: Date.now(),
    payload: payload as T,
    ...extras,
  } as Envelope<T>;
}

export function parseEnvelope(data: string | Buffer): Envelope {
  const text = Buffer.isBuffer(data) ? data.toString("utf8") : data;
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid envelope: not an object");
  }
  const record = parsed as Record<string, unknown>;
  if (record.version !== "2") {
    throw new Error(`Unsupported protocol version: ${record.version}`);
  }
  if (typeof record.event !== "string" || !record.event) {
    throw new Error("Missing event");
  }
  if (!record.trace_id) record.trace_id = `auto_${Date.now()}`;
  if (!record.emitted_at) record.emitted_at = Date.now();
  if (!record.payload) record.payload = {};
  return record as unknown as Envelope;
}

export function serializeEnvelope(envelope: Envelope): string {
  return JSON.stringify(envelope);
}

export function extractTextFromFragments(fragments: Fragment[]): string {
  return fragments
    .map((f) => {
      if (f.kind === "text") return f.text;
      if (f.kind === "mention") return f.display ? `@${f.display}` : "";
      if (f.kind === "image") return "[图片]";
      if (f.kind === "file") return `[文件: ${f.name || "未知"}]`;
      if (f.kind === "audio") return "[语音]";
      if (f.kind === "video") return "[视频]";
      return "";
    })
    .join("")
    .trim();
}

export function buildTextFragments(text: string): Fragment[] {
  return [{ kind: "text", text }];
}

export function normalizeInboundMessage(
  envelope: Envelope<MessagePayload>,
): NormalizedInboundMessage | null {
  if (envelope.event !== "message.send" && envelope.event !== "message.reply") {
    return null;
  }
  const payload = envelope.payload;
  if (!payload?.message?.body?.fragments) {
    return null;
  }
  const fragments = payload.message.body.fragments;
  const text = extractTextFromFragments(fragments);
  const mentions: string[] = [];
  for (const m of payload.message.context?.mentions || []) {
    if (typeof m === "string") mentions.push(m);
    else if (m && typeof m === "object" && "user_id" in m) mentions.push(String(m.user_id));
  }
  const replyTo = payload.message.context?.reply?.reply_to_msg_id ?? null;

  return {
    event: envelope.event,
    chatId: envelope.chat_id!,
    chatType: envelope.chat_type || "direct",
    messageId: payload.message_id || envelope.trace_id,
    traceId: envelope.trace_id,
    sender: envelope.sender!,
    emittedAt: envelope.emitted_at,
    text,
    fragments,
    mentions,
    replyToMessageId: replyTo,
    raw: envelope as Envelope<MessagePayload>,
  };
}

export function buildMessagePayload(
  text: string,
  options: { replyTo?: string; messageId?: string } = {},
): MessagePayload {
  return {
    message_id: options.messageId,
    message_mode: "standard",
    message: {
      body: { fragments: buildTextFragments(text) },
      context: {
        mentions: [],
        reply: options.replyTo
          ? { reply_to_msg_id: options.replyTo, reply_preview: null }
          : null,
      },
      streaming: {
        status: "static",
        sequence: 0,
        mutation_policy: "sealed",
        started_at: Date.now(),
        completed_at: Date.now(),
      },
    },
  };
}
