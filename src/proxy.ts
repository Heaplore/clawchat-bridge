import { HttpsProxyAgent } from "https-proxy-agent";
import { Agent as HttpAgent } from "http";
import type { Agent as HttpsAgent } from "https";

let cachedFetchAgent: HttpAgent | HttpsAgent | undefined;
let cachedWsAgent: HttpsProxyAgent<string> | undefined;

function getProxyUrl(): string | null {
  const https = process.env.HTTPS_PROXY || process.env.https_proxy;
  const http = process.env.HTTP_PROXY || process.env.http_proxy;
  return https || http || null;
}

export function getFetchAgent(): HttpAgent | HttpsAgent | undefined {
  if (cachedFetchAgent !== undefined) return cachedFetchAgent;
  const proxy = getProxyUrl();
  if (!proxy) {
    cachedFetchAgent = undefined;
    return undefined;
  }
  cachedFetchAgent = new HttpsProxyAgent(proxy);
  return cachedFetchAgent;
}

export function getWsOptions(): { agent?: HttpsProxyAgent<string> } {
  const proxy = getProxyUrl();
  if (!proxy) return {};
  if (!cachedWsAgent) cachedWsAgent = new HttpsProxyAgent(proxy);
  return { agent: cachedWsAgent };
}
