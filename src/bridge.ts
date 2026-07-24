import type {
  BridgeConfig,
  Envelope,
  LLMProvider,
  MessagePayload,
  NormalizedInboundMessage,
} from "./types.js";
import { ClawChatWsClient } from "./ws-client.js";
import { SessionManager } from "./session-manager.js";
import { SecurityGuard } from "./security.js";
import { buildMessagePayload, normalizeInboundMessage } from "./protocol.js";
import { runAgent } from "./agent.js";

function buildSystemPrompt(msg: NormalizedInboundMessage): string {
  return [
    "你是运行在 ClawChat 平台上的 AI Agent，可以读写文件、执行命令、搜索代码。",
    "",
    `会话类型: ${msg.chatType}`,
    `会话ID: ${msg.chatId}`,
    `发送者: ${msg.sender.nick_name} (${msg.sender.id})`,
    msg.mentions.length > 0 ? `提及: ${msg.mentions.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function stripAgentMention(text: string): string {
  return text.replace(/@\S+\s*/g, "").trim();
}

export class Bridge {
  private ws: ClawChatWsClient;
  private llm: LLMProvider;
  private sessions: SessionManager;
  private security: SecurityGuard;
  private config: BridgeConfig;
  private workdir: string;
  private messageQueue: NormalizedInboundMessage[] = [];
  private isProcessing = false;
  private instanceTag: string;

  constructor(config: BridgeConfig, ws: ClawChatWsClient, llm: LLMProvider) {
    this.config = config;
    this.ws = ws;
    this.llm = llm;
    this.workdir = process.env.AGENT_WORKDIR || process.cwd();
    this.sessions = new SessionManager(config.server.contextWindow);
    this.security = new SecurityGuard({
      dmPolicy: config.security.dmPolicy,
      dmAllowlist: config.security.dmAllowlist,
      groupAllowlist: config.security.groupAllowlist,
      requireMentionInGroup: config.security.requireMentionInGroup,
      agentId: config.clawchat.agentId,
    });
    this.instanceTag = `[${config.server.instanceName}]`;
  }

  start(): void {
    this.ws.onInbound((envelope) => this.handleEnvelope(envelope));
    console.log(`${this.instanceTag} [Bridge] Agent workdir: ${this.workdir}`);
  }

  private async handleEnvelope(envelope: Envelope): Promise<void> {
    if (envelope.event === "message.send" || envelope.event === "message.reply") {
      const normalized = normalizeInboundMessage(envelope as Envelope<MessagePayload>);
      if (normalized) {
        this.enqueueMessage(normalized);
      }
    }
  }

  private enqueueMessage(message: NormalizedInboundMessage): void {
    if (message.sender.id === this.config.clawchat.agentId) return;

    const check = this.security.check(message);
    if (!check.allowed) {
      console.log(`${this.instanceTag} [Security] Blocked: ${check.reason}`);
      return;
    }

    this.messageQueue.push(message);
    console.log(
      `${this.instanceTag} [Bridge] Queue: +1 msg (total=${this.messageQueue.length}) ` +
        `${message.chatType} @${message.sender.nick_name}`,
    );
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;
      await this.processOne(message);
    }

    this.isProcessing = false;
  }

  private async processOne(message: NormalizedInboundMessage): Promise<void> {
    try {
      await this.ws.sendTyping(message.chatId, true);

      const systemPrompt = buildSystemPrompt(message);
      this.sessions.getOrCreate(message.chatId, message.chatType, systemPrompt);

      let userText = message.text;
      if (message.chatType === "group") {
        userText = stripAgentMention(userText);
      }
      if (!userText.trim()) return;

      console.log(
        `${this.instanceTag} [Bridge] → ${message.chatType} @${message.sender.nick_name}: ` +
          `${userText.slice(0, 80)}${userText.length > 80 ? "..." : ""}`,
      );

      const ackPayload = buildMessagePayload("🤔 正在处理，请稍候...", { replyTo: message.messageId });
      this.ws.sendMessage(message.chatId, message.chatType, ackPayload).catch(() => {});

      console.log(`${this.instanceTag} [Agent] Starting task for ${message.chatId}...`);
      const t0 = Date.now();
      const agentReply = await runAgent(this.llm, userText, {
        maxIterations: 12,
        workdir: this.workdir,
        timeoutMs: 300000,
      });
      const duration = ((Date.now() - t0) / 1000).toFixed(1);

      this.sessions.appendMessage(message.chatId, { role: "user", content: userText });
      this.sessions.appendMessage(message.chatId, { role: "assistant", content: agentReply });

      const payload = buildMessagePayload(agentReply, { replyTo: message.messageId });
      const sentId = await this.ws.sendMessage(message.chatId, message.chatType, payload);

      console.log(
        `${this.instanceTag} [Bridge] ← replied in ${duration}s (${agentReply.length} chars, msgId=${sentId})`,
      );
    } catch (err) {
      console.error(`${this.instanceTag} [Bridge] Error processing ${message.messageId}:`, err);
      try {
        const errPayload = buildMessagePayload(
          `⚠️ 处理出错：${(err as Error).message}`,
          { replyTo: message.messageId },
        );
        await this.ws.sendMessage(message.chatId, message.chatType, errPayload);
      } catch {
        /* ignore */
      }
    } finally {
      try {
        await this.ws.sendTyping(message.chatId, false);
      } catch {
        /* ignore */
      }
    }
  }

  clearSession(conversationId: string): void {
    this.sessions.clear(conversationId);
  }
}
