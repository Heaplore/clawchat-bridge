import { exec } from "child_process";
import {
  readFile,
  writeFile,
  readdir,
  stat,
  mkdir,
} from "fs/promises";
import { existsSync } from "fs";
import { resolve, relative, basename } from "path";
import type { LLMProvider, LLMMessage } from "./types.js";

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface AgentRunOptions {
  maxIterations?: number;
  workdir?: string;
  timeoutMs?: number;
}

const TOOL_ALIASES: Record<string, string> = {
  bash: "run_command",
  shell: "run_command",
  exec: "run_command",
  terminal: "run_command",
  command: "run_command",
  run: "run_command",
  read: "read_file",
  cat: "read_file",
  view: "read_file",
  write: "write_file",
  create: "write_file",
  save: "write_file",
  ls: "list_dir",
  dir: "list_dir",
  list: "list_dir",
  find: "search_code",
  grep: "search_code",
  search: "search_code",
  answer: "finish",
  done: "finish",
  complete: "finish",
  final: "finish",
};

function buildSystemPrompt(workdir: string): string {
  return `你是一个运行在 Linux 环境中的自主 AI Agent，工作区根目录: ${workdir}

## 可用工具

### 1. bash (执行 shell 命令)
参数: {"command": "shell 命令", "timeout": 60000}
用途: 安装依赖、运行构建、执行测试、git 操作、查看进程等。
注意: 命令在工作区执行，有超时限制，不要运行长时间阻塞命令。

### 2. read_file (读取文件)
参数: {"path": "相对工作区的文件路径"}
用途: 查看代码、配置、文档内容。

### 3. write_file (写入文件)
参数: {"path": "相对路径", "content": "文件完整内容"}
用途: 创建或覆盖文件。目录不存在时会自动创建。

### 4. list_dir (列出目录)
参数: {"path": "相对路径，默认根目录"}
用途: 探索项目结构，查看目录下的文件。

### 5. search_code (代码搜索)
参数: {"pattern": "搜索关键词或正则", "glob": "*.ts 或 src/**/*.ts"}
用途: 在代码库中搜索符号、引用。

### 6. finish (给出最终答案)
参数: {"answer": "给用户的最终回答（Markdown）"}
用途: 任务完成，输出最终结果。

## 工作方式 (ReAct)

每一步必须使用以下格式：

\`\`\`
Thought: 你对当前情况的分析和下一步计划
Action: 工具名 (bash / read_file / write_file / list_dir / search_code / finish)
Action Input: {"参数名": "参数值"}
\`\`\`

规则：
- 每次只能调用一个工具
- 调用 finish 后任务结束
- 不确定时先搜索或查看文件，不要编造
- 破坏性操作（rm -rf、git reset --hard）要谨慎
- 用中文思考和回答`;
}

function extractAction(content: string): ToolCall | null {
  const cleaned = content.replace(/```/g, "").trim();

  const actionMatch = cleaned.match(/Action:\s*(\w+)/);
  const inputMatch = cleaned.match(/Action Input:\s*(\{[\s\S]*?\})(?:\n|$)/);

  if (!actionMatch) {
    const directCmd = cleaned.match(/^(bash|shell|exec)\s+(.+)/i);
    if (directCmd) {
      return { name: "run_command", input: { command: directCmd[2] } };
    }
    return null;
  }

  let name = actionMatch[1].toLowerCase().trim();
  name = TOOL_ALIASES[name] || name;

  let input: Record<string, unknown> = {};
  if (inputMatch) {
    try {
      input = JSON.parse(inputMatch[1]);
    } catch {
      const raw = inputMatch[1].trim();
      if (name === "run_command" && !raw.includes(":")) {
        input = { command: raw.replace(/^["']|["']$/g, "") };
      } else {
        input = { raw };
      }
    }
  }

  return { name, input };
}

async function execCommand(command: string, cwd: string, timeoutMs = 60000): Promise<string> {
  return new Promise((resolve) => {
    const child = exec(command, { cwd, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 });
    let output = "";
    child.stdout?.on("data", (d) => (output += d));
    child.stderr?.on("data", (d) => (output += d));
    child.on("close", (code) => {
      const prefix = code === 0 ? "" : `[exit ${code}]\n`;
      resolve(prefix + output.slice(-4000));
    });
    child.on("error", (err) => {
      resolve(`[error] ${err.message}`);
    });
  });
}

async function runTool(call: ToolCall, workdir: string): Promise<string> {
  const safePath = (p: string): string => {
    const resolved = resolve(workdir, p);
    const rel = relative(workdir, resolved);
    if (rel.startsWith("..")) throw new Error(`路径越界: ${p}`);
    return resolved;
  };

  try {
    switch (call.name) {
      case "read_file": {
        const p = safePath(String(call.input.path || ""));
        if (!existsSync(p)) return `[错误] 文件不存在: ${p}`;
        const s = await stat(p);
        if (s.isDirectory()) return `[错误] 这是目录，不是文件: ${p}`;
        const content = await readFile(p, "utf-8");
        return content.slice(-10000);
      }

      case "write_file": {
        const p = safePath(String(call.input.path || ""));
        const content = String(call.input.content || "");
        const dir = p.slice(0, p.length - basename(p).length);
        if (dir && !existsSync(dir)) await mkdir(dir, { recursive: true });
        await writeFile(p, content, "utf-8");
        return `✅ 已写入 ${relative(workdir, p)} (${content.length} bytes)`;
      }

      case "run_command": {
        const cmd = String(call.input.command || "");
        const timeout = call.input.timeout ? Number(call.input.timeout) : 60000;
        if (!cmd.trim()) return "[错误] 命令不能为空";
        return await execCommand(cmd, workdir, timeout);
      }

      case "list_dir": {
        const p = call.input.path ? safePath(String(call.input.path)) : workdir;
        if (!existsSync(p)) return `[错误] 目录不存在: ${p}`;
        const entries = await readdir(p, { withFileTypes: true });
        const items = entries
          .sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
          })
          .map((e) => (e.isDirectory() ? `📁 ${e.name}/` : `📄 ${e.name}`))
          .join("\n");
        return items || "(空目录)";
      }

      case "search_code": {
        const pattern = String(call.input.pattern || "");
        const glob = call.input.glob ? String(call.input.glob) : undefined;
        let cmd = `grep -rIn --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=build "${pattern}" "${workdir}"`;
        if (glob) {
          const exts = glob.replace(/[*{}]/g, "").split(",").filter(Boolean);
          const includeFlag = exts.map((e) => `--include="*${e.startsWith(".") ? e : "." + e}"`).join(" ");
          cmd = `grep -rIn ${includeFlag} --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git "${pattern}" "${workdir}"`;
        }
        const result = await execCommand(cmd, workdir, 30000);
        return result.slice(-5000) || "(无匹配结果)";
      }

      case "finish": {
        return `__FINAL_ANSWER__\n${call.input.answer || ""}`;
      }

      default:
        return `[错误] 未知工具: ${call.name}。可用工具: bash, read_file, write_file, list_dir, search_code, finish`;
    }
  } catch (err) {
    return `[工具执行错误] ${(err as Error).message}`;
  }
}

export async function runAgent(
  llm: LLMProvider,
  userQuery: string,
  options: AgentRunOptions = {},
): Promise<string> {
  const maxIterations = options.maxIterations ?? 15;
  const workdir = resolve(options.workdir ?? process.cwd());
  const overallTimeout = options.timeoutMs ?? 300000;

  let overallTimedOut = false;
  const overallTimer = setTimeout(() => {
    overallTimedOut = true;
  }, overallTimeout);

  const messages: LLMMessage[] = [
    { role: "system", content: buildSystemPrompt(workdir) },
    { role: "user", content: userQuery },
  ];

  let iteration = 0;

  try {
    while (iteration < maxIterations) {
      if (overallTimedOut) {
        return `⏰ 处理超时（${overallTimeout / 1000}s），以下是已完成的部分：\n${messages[messages.length - 1]?.content || ""}`;
      }

      iteration++;

      const t0 = Date.now();
      let response: string;
      try {
        response = await llm.chat(messages, { temperature: 0.1, maxTokens: 2048 });
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes("abort") || msg.includes("timeout")) {
          return `⏰ LLM 请求超时，请稍后再试。`;
        }
        throw err;
      }
      const llmMs = Date.now() - t0;
      console.log(`[Agent] iter ${iteration}/${maxIterations}: LLM ${response.length} chars in ${llmMs}ms`);

      messages.push({ role: "assistant", content: response });

      const action = extractAction(response);

      if (!action) {
        if (iteration >= maxIterations - 1) {
          return response;
        }
        messages.push({
          role: "user",
          content:
            "请按照格式输出：Thought + Action + Action Input。可用工具：bash (执行命令), read_file (读文件), write_file (写文件), list_dir (列目录), search_code (搜索代码), finish (给出答案)。",
        });
        continue;
      }

      if (action.name === "finish") {
        return String(action.input.answer || "任务完成。");
      }

      console.log(`[Agent] → tool: ${action.name}`);
      const toolT0 = Date.now();
      const result = await runTool(action, workdir);
      console.log(`[Agent] ← tool ${action.name} done in ${Date.now() - toolT0}ms (${result.length} chars)`);

      if (result.startsWith("__FINAL_ANSWER__")) {
        return result.replace(/^__FINAL_ANSWER__\s*/, "");
      }

      messages.push({
        role: "user",
        content: `Observation:\n${result}`,
      });
    }

    return messages[messages.length - 1]?.content || "已达到最大迭代次数。";
  } finally {
    clearTimeout(overallTimer);
  }
}
