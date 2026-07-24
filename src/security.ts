import type { NormalizedInboundMessage } from "./types.js";

export interface SecurityPolicy {
  dmPolicy: "allowlist" | "blocklist" | "all";
  dmAllowlist: string[];
  groupAllowlist: string[];
  requireMentionInGroup: boolean;
  agentId: string;
}

export class SecurityGuard {
  constructor(private policy: SecurityPolicy) {}

  check(message: NormalizedInboundMessage): { allowed: boolean; reason?: string } {
    if (message.chatType === "direct") {
      return this.checkDirect(message);
    }
    return this.checkGroup(message);
  }

  private checkDirect(message: NormalizedInboundMessage): { allowed: boolean; reason?: string } {
    const senderId = message.sender.id;
    switch (this.policy.dmPolicy) {
      case "all":
        return { allowed: true };
      case "blocklist":
        return { allowed: true };
      case "allowlist":
      default:
        if (!this.policy.dmAllowlist.includes(senderId) && this.policy.dmAllowlist.length > 0) {
          return { allowed: false, reason: "Sender not on DM allowlist" };
        }
        return { allowed: true };
    }
  }

  private checkGroup(message: NormalizedInboundMessage): { allowed: boolean; reason?: string } {
    if (
      this.policy.groupAllowlist.length > 0 &&
      !this.policy.groupAllowlist.includes(message.chatId)
    ) {
      return { allowed: false, reason: "Group not on allowlist" };
    }
    if (this.policy.requireMentionInGroup) {
      const mentionsAgent =
        message.mentions.includes(this.policy.agentId) ||
        message.text.includes(`@${this.policy.agentId}`);
      if (!mentionsAgent) {
        return { allowed: false, reason: "Agent not mentioned in group" };
      }
    }
    return { allowed: true };
  }
}
