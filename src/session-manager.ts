import type { LLMMessage, Session, ChatType } from "./types.js";

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private contextWindow: number;

  constructor(contextWindow = 20) {
    this.contextWindow = contextWindow;
  }

  getOrCreate(conversationId: string, chatType: ChatType, systemPrompt?: string): Session {
    let session = this.sessions.get(conversationId);
    if (!session) {
      const messages: LLMMessage[] = [];
      if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
      session = {
        id: `sess_${conversationId}`,
        conversationId,
        chatType,
        messages,
        lastActive: Date.now(),
      };
      this.sessions.set(conversationId, session);
    }
    return session;
  }

  appendMessage(conversationId: string, message: LLMMessage): void {
    const session = this.sessions.get(conversationId);
    if (!session) return;
    session.messages.push(message);
    session.lastActive = Date.now();
    if (session.messages.length > this.contextWindow * 2) {
      const sysMsg = session.messages[0];
      const rest = session.messages.slice(1);
      const trimmed = rest.slice(-this.contextWindow * 2);
      session.messages = sysMsg?.role === "system" ? [sysMsg, ...trimmed] : trimmed;
    }
  }

  getMessages(conversationId: string): LLMMessage[] {
    return this.sessions.get(conversationId)?.messages || [];
  }

  clear(conversationId: string): void {
    const session = this.sessions.get(conversationId);
    if (session) {
      const sysMsg = session.messages[0];
      session.messages = sysMsg?.role === "system" ? [sysMsg] : [];
    }
  }
}
