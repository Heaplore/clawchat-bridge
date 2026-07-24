import fetch from "node-fetch";
import { AGENT_TYPE, PLATFORM_ID } from "./types.js";
import type { ActivationResult } from "./types.js";
import { getFetchAgent } from "./proxy.js";

export class ClawChatRestClient {
  private baseUrl: string;
  private deviceId: string;
  private token: string;

  constructor(baseUrl: string, deviceId: string, token = "") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.deviceId = deviceId;
    this.token = token;
  }

  setToken(token: string): void {
    this.token = token;
  }

  private async request<T>(
    method: string,
    path: string,
    options: { body?: unknown; auth?: boolean } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-device-id": this.deviceId,
    };
    if (options.auth !== false && this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      agent: getFetchAgent(),
    });

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (res.status === 401) {
      throw new Error(`ClawChat API auth failed: ${path}`);
    }

    if (data && typeof data === "object" && "code" in data) {
      const record = data as Record<string, unknown>;
      if (record.code !== 0) {
        throw new Error(
          `ClawChat API ${path} failed: code=${record.code} msg=${record.msg}`,
        );
      }
      return record.data as T;
    }

    if (!res.ok) {
      throw new Error(`ClawChat API ${path} HTTP ${res.status}`);
    }

    return data as T;
  }

  async agentsConnect(
    code: string,
    existingUserId?: string,
  ): Promise<{
    access_token: string;
    refresh_token: string | null;
    agent: { id?: string; user_id?: string; owner_id?: string };
    conversation: { id?: string } | null;
  }> {
    const body: Record<string, string> = {
      code,
      platform: PLATFORM_ID,
      type: AGENT_TYPE,
    };
    if (existingUserId) body.user_id = existingUserId;
    return this.request("POST", "/v1/agents/connect", { body, auth: false });
  }

  async updateMyProfile(patch: {
    nickname?: string;
    avatar_url?: string;
    bio?: string;
  }): Promise<unknown> {
    return this.request("PATCH", "/v1/users/me", { body: patch });
  }

  async sendText(conversationId: string, text: string): Promise<{ id: string }> {
    return this.request("POST", "/v1/messages/sendText", {
      body: { conversationId, text },
    });
  }

  async createMoment(text: string, images?: string[]): Promise<{ id: string }> {
    return this.request("POST", "/v1/moments", { body: { text, images } });
  }
}

export function normalizeActivationResult(
  raw: Awaited<ReturnType<ClawChatRestClient["agentsConnect"]>>,
): ActivationResult {
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token || null,
    serverAgentId: raw.agent?.id || null,
    userId: raw.agent?.user_id || "",
    ownerUserId: raw.agent?.owner_id || "",
    conversationId: raw.conversation?.id || null,
  };
}
