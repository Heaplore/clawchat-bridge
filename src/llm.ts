import fetch from "node-fetch";
import type { LLMMessage, LLMProvider } from "./types.js";
import { getFetchAgent } from "./proxy.js";

abstract class BaseProvider implements LLMProvider {
  abstract id: string;
  constructor(
    protected apiKey: string,
    protected model: string,
    protected apiBase: string,
  ) {}
  abstract chat(messages: LLMMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<string>;
}

export class DoubaoProvider extends BaseProvider {
  id = "doubao";
  constructor(apiKey: string, model: string, _apiBase?: string) {
    super(apiKey, model, "https://ark.cn-beijing.volces.com/api/v3");
  }
  async chat(messages: LLMMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(`${this.apiBase}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 4096,
        }),
        agent: getFetchAgent(),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Doubao API failed: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      return data.choices[0]?.message?.content || "";
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class DeepSeekProvider extends BaseProvider {
  id = "deepseek";
  constructor(apiKey: string, model: string, _apiBase?: string) {
    super(apiKey, model, "https://api.deepseek.com/v1");
  }
  async chat(messages: LLMMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(`${this.apiBase}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 4096,
        }),
        agent: getFetchAgent(),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`DeepSeek API failed: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      return data.choices[0]?.message?.content || "";
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class OpenAICompatibleProvider extends BaseProvider {
  id = "openai-compatible";
  constructor(apiKey: string, model: string, apiBase: string) {
    super(apiKey, model, apiBase);
  }
  async chat(messages: LLMMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(`${this.apiBase}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 4096,
        }),
        agent: getFetchAgent(),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`OpenAI API failed: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      return data.choices[0]?.message?.content || "";
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createLLMProvider(
  providerType: "doubao" | "deepseek" | "openai-compatible",
  apiKey: string,
  model: string,
  apiBase?: string,
): LLMProvider {
  switch (providerType) {
    case "doubao":
      return new DoubaoProvider(apiKey, model);
    case "deepseek":
      return new DeepSeekProvider(apiKey, model);
    case "openai-compatible":
      if (!apiBase) throw new Error("LLM_API_BASE is required for openai-compatible");
      return new OpenAICompatibleProvider(apiKey, model, apiBase);
    default:
      throw new Error(`Unknown LLM provider: ${providerType}`);
  }
}
