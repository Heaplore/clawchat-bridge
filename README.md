# ClawChat Bridge

基于 ClawChat WebSocket Protocol v2 的 **自主 AI Agent Bridge 服务**。将 ClawChat 平台与工作区连接，支持 Agent 自主读写文件、执行命令、搜索代码，实现群聊协作开发。

## 特性

- 🤖 **自主 Agent 循环**：ReAct 模式，自主决定调用工具解决问题
- 📁 **文件操作**：读取、创建、编辑项目文件
- ⚡ **命令执行**：运行 shell 命令（npm install、构建、测试、git 等）
- 🔍 **代码搜索**：全局 grep 搜索，支持文件类型过滤
- 🔌 **原生 WebSocket 协议**：完整实现 ClawChat Protocol v2（Envelope + Fragment）
- 🤝 **Challenge/Connect 认证**：标准的 ClawChat Agent 激活和握手流程
- 🛡️ **安全策略**：DM 白名单、群白名单、@提及门控
- 📚 **会话管理**：自动上下文窗口裁剪，支持多会话
- 🔌 **多 LLM 提供商**：豆包（Doubao）、DeepSeek、OpenAI 兼容协议
- 💓 **心跳保活 & 自动重连**：指数退避重连策略
- 📡 **HTTP 代理支持**：自动识别 `HTTPS_PROXY` 环境变量
- 🏗️ **多实例支持**：同一台电脑运行多个 Bridge（TRAE、WorkBuddy 等多平台）

## 架构

```
ClawChat Server (wss://app.clawling.com/ws)
        │
        │  WebSocket (Protocol v2: Envelope)
        ▼
  ClawChatWsClient ── Challenge/Connect 认证
        │
        ▼
      Bridge
        │
        ├── SecurityGuard (DM/Group 策略)
        ├── ReAct Agent 循环
        │     ├── bash (执行 shell 命令)
        │     ├── read_file / write_file
        │     ├── list_dir
        │     └── search_code
        └── LLM Provider (Doubao / DeepSeek / OpenAI)
```

## 快速开始

### 单实例快速开始

如果只需要运行一个 Agent，按以下步骤操作：

#### 1. 安装依赖

```bash
cd clawchat-bridge
npm install
```

#### 2. 激活 Agent（获取访问令牌）

使用你的 ClawChat 邀请码激活：

```bash
npm run activate YOUR_INVITE_CODE
```

激活成功后会输出以下凭据，保存到 `.env` 文件：

```
CLAWCHAT_ACCESS_TOKEN=...
CLAWCHAT_REFRESH_TOKEN=...
CLAWCHAT_DEVICE_ID=...
CLAWCHAT_AGENT_ID=...
CLAWCHAT_OWNER_USER_ID=...
```

#### 3. 配置 LLM

编辑 `.env` 文件，配置你的 LLM 提供商：

**豆包（Doubao）：**
```env
LLM_PROVIDER=doubao
LLM_API_KEY=your_doubao_api_key
LLM_MODEL=doubao-seed-1.6
```

**DeepSeek：**
```env
LLM_PROVIDER=deepseek
LLM_API_KEY=your_deepseek_api_key
LLM_MODEL=deepseek-chat
```

**OpenAI 兼容（如 AgnesAI）：**
```env
LLM_PROVIDER=openai-compatible
LLM_API_KEY=your_api_key
LLM_MODEL=agnes-2.0-flash
LLM_API_BASE=https://apihub.agnes-ai.com/v1
```

#### 4. 启动 Bridge

```bash
npm start
```

成功启动后输出：
```
[Server] Health check on http://0.0.0.0:3000/health
[WS] Connected, waiting for challenge...
[WS] Received challenge, sending connect...
[WS] Hello OK! device_id=dev_xxx
[Bridge] Ready - listening for messages via WebSocket
```

现在去 ClawChat 给你的 Agent 发消息即可收到自动回复！

---

## 多实例（多平台）运行

你可以在同一台电脑上运行多个 Bridge 实例，每个实例：
- 使用**独立的 ClawChat 邀请码**（在 ClawChat 上注册为不同的 Agent）
- 连接**不同的工作区目录**
- 使用**不同的模型配置**
- 监听**不同的端口**

典型场景：同时运行 **TRAE Agent** 和 **WorkBuddy Agent**，在 ClawChat 上分别操作两个平台的工作区。

### 架构

```
ClawChat 平台
┌──────────────────────────────────────────────┐
│  ┌───────────────┐      ┌────────────────┐  │
│  │  TRAE Agent   │      │ WorkBuddy      │  │
│  │  (Bridge #1)  │      │ Agent (Bridge #2)│
│  └───────┬───────┘      └───────┬────────┘  │
└──────────┼────────────────────────┼───────────┘
           │ wss://                 │ wss://
           ▼                        ▼
┌─────────────────────┐   ┌─────────────────────┐
│  Bridge 进程 #1     │   │  Bridge 进程 #2     │
│  --env trae         │   │  --env workbuddy    │
│  工作区: TRAE 目录  │   │  工作区: WB 目录    │
│  端口: 3001         │   │  端口: 3002         │
└──────────┬──────────┘   └──────────┬──────────┘
           │                           │
           ▼                           ▼
    TRAE 本地工作区              WorkBuddy 本地工作区
```

### 步骤 1：准备多个邀请码

从 ClawChat 获取 **N 个独立的邀请码**，每个邀请码对应一个 Agent 身份。

### 步骤 2：为每个实例创建配置文件

项目提供了两个配置模板：

| 模板文件 | 用途 | 默认端口 |
|---------|------|---------|
| `.env.trae.example` | TRAE 平台 Agent | 3001 |
| `.env.workbuddy.example` | WorkBuddy 平台 Agent | 3002 |

复制并编辑配置：

```bash
# TRAE 实例
cp .env.trae.example .env.trae
# 编辑 .env.trae：
#   - 填入激活凭据（见步骤 3）
#   - LLM_API_KEY / LLM_MODEL（TRAE 用的模型）
#   - AGENT_WORKDIR=E:/trae workspace（你的 TRAE 工作区路径）
#   - PORT=3001
#   - BRIDGE_INSTANCE=trae

# WorkBuddy 实例
cp .env.workbuddy.example .env.workbuddy
# 编辑 .env.workbuddy：
#   - 填入激活凭据（见步骤 3）
#   - LLM_API_KEY / LLM_MODEL（WorkBuddy 用的模型）
#   - AGENT_WORKDIR=E:/workbuddy workspace（你的 WorkBuddy 工作区路径）
#   - PORT=3002
#   - BRIDGE_INSTANCE=workbuddy
```

### 步骤 3：分别激活每个实例

```bash
# 激活 TRAE Agent（使用 TRAE 的邀请码）
npm run activate:trae -- YOUR_TRAE_INVITE_CODE
# 将输出的凭据复制到 .env.trae 中

# 激活 WorkBuddy Agent（使用 WorkBuddy 的邀请码）
npm run activate:workbuddy -- YOUR_WORKBUDDY_INVITE_CODE
# 将输出的凭据复制到 .env.workbuddy 中
```

### 步骤 4：启动所有实例

#### 方式 A：分别在不同终端启动（推荐，便于查看日志）

**终端 1 - TRAE Bridge：**
```bash
cd clawchat-bridge
npm run start:trae
```

**终端 2 - WorkBuddy Bridge：**
```bash
cd clawchat-bridge
npm run start:workbuddy
```

#### 方式 B：使用 Windows 批处理脚本（推荐 Windows 用户）

双击 `start-trae.bat` 和 `start-workbuddy.bat` 即可分别启动。

**批处理脚本功能：**
- 自动检查 `node_modules`，如缺失则运行 `npm install`
- 自动检查对应配置文件（`.env.trae` / `.env.workbuddy`），如缺失则提示从模板创建
- 自动构建项目（如 `dist/` 目录不存在）
- 启动对应实例

激活脚本 `activate.bat`：
```
activate.bat trae YOUR_TRAE_CODE    # 激活 TRAE 实例
activate.bat workbuddy YOUR_WB_CODE # 激活 WorkBuddy 实例
activate.bat YOUR_CODE               # 激活默认实例
```

#### 方式 C：自定义实例

```bash
# 加载 .env.mycopilot 配置启动
npm run dev -- --env mycopilot
# 或
node dist/server.js --env mycopilot
```

### 步骤 5：在 ClawChat 上使用

打开 ClawChat，你会看到多个独立的 Agent：
- **TRAE Agent** → 操作 TRAE 工作区的文件
- **WorkBuddy Agent** → 操作 WorkBuddy 工作区的文件

每个 Agent 有独立的会话历史和上下文。

### 多实例可用的命令

所有支持的 `npm scripts`：

| 命令 | 说明 |
|------|------|
| `npm run start` | 使用 `.env` 启动（默认单实例） |
| `npm run start:trae` | 使用 `.env.trae` 启动 TRAE 实例 |
| `npm run start:workbuddy` | 使用 `.env.workbuddy` 启动 WorkBuddy 实例 |
| `npm run dev` | 开发模式（使用 `.env`） |
| `npm run dev:trae` | 开发模式（使用 `.env.trae`） |
| `npm run dev:workbuddy` | 开发模式（使用 `.env.workbuddy`） |
| `npm run activate CODE` | 激活默认实例 |
| `npm run activate:trae -- CODE` | 激活 TRAE 实例 |
| `npm run activate:workbuddy -- CODE` | 激活 WorkBuddy 实例 |

指定配置文件的三种方式（优先级从高到低）：

1. **命令行参数**：`node dist/server.js --env trae` 或 `node dist/server.js -e trae`
2. **环境变量**：`BRIDGE_ENV=trae npm start`
3. **配置中的 BRIDGE_INSTANCE**：在 `.env` 文件中设置 `BRIDGE_INSTANCE=trae`（仅用于日志标识）

## Agent 配置

```env
# Agent 工作区根目录（Agent 在此目录下操作文件和执行命令）
AGENT_WORKDIR=/workspace

# Agent 最大迭代次数（默认 15）
# AGENT_MAX_ITERATIONS=15
```

Agent 支持以下自主能力：

| 工具 | 说明 |
|------|------|
| `bash` | 执行 shell 命令（npm install、构建、测试、git 等） |
| `read_file` | 读取工作区中的文件 |
| `write_file` | 写入或创建文件（自动创建目录） |
| `list_dir` | 列出目录内容，探索项目结构 |
| `search_code` | 全局代码搜索（grep，支持文件类型过滤） |
| `finish` | 给出最终答案，结束任务 |

Agent 使用 **ReAct 模式**自主工作：先思考（Thought）→ 调用工具（Action）→ 观察结果（Observation）→ 循环直到完成。

## 使用示例

在 ClawChat 群里 @Agent 或私聊中直接发送：

```
帮我看看 clawchat-bridge 项目的 package.json 有哪些依赖
```

```
在 /workspace/test 目录下创建一个 hello.js 文件，内容是 console.log('Hello')，然后执行它
```

```
搜索一下项目里哪里用到了 WebSocket
```

## 安全策略配置

```env
# DM 策略: allowlist | all
DM_POLICY=all
# DM 白名单（逗号分隔的 user_id）
DM_ALLOWLIST=

# 群白名单（逗号分隔的 chat_id），留空表示允许所有群
GROUP_ALLOWLIST=

# 群聊中是否必须 @Agent 才触发回复
REQUIRE_MENTION_IN_GROUP=true
```

## 项目结构

```
src/
├── types.ts            # Protocol v2 类型定义 (Envelope, Fragment, EVENT 等)
├── protocol.ts         # Envelope 序列化/解析、消息归一化
├── proxy.ts            # HTTP 代理支持 (HTTPS_PROXY)
├── ws-client.ts        # WebSocket 客户端（认证、消息发送、心跳、重连）
├── api-client.ts       # REST API 客户端（激活、发消息、更新资料）
├── agent.ts            # ReAct Agent 循环（自主调用工具）
├── bridge.ts           # 核心桥接逻辑
├── llm.ts              # LLM Provider 实现
├── security.ts         # 安全策略
├── session-manager.ts  # 会话管理
├── config.ts           # 配置加载
├── cli.ts              # 激活 CLI
├── send-test.ts        # 测试消息发送脚本
└── server.ts           # 服务入口
```

## 协议说明

### WebSocket Protocol v2

所有消息采用 **Envelope** 格式：

```json
{
  "version": "2",
  "event": "message.send",
  "trace_id": "uuid",
  "emitted_at": 1710000000000,
  "chat_id": "cnv_xxx",
  "chat_type": "direct",
  "sender": { "id": "usr_xxx", "nick_name": "Alice" },
  "payload": {
    "message_id": "msg_xxx",
    "message_mode": "standard",
    "message": {
      "body": {
        "fragments": [
          { "kind": "text", "text": "你好" }
        ]
      }
    }
  }
}
```

### 认证流程

```
Client                    Server
  │                         │
  │────── WebSocket ───────►│
  │                         │
  │◄── connect.challenge ───│  (包含 nonce)
  │                         │
  │────── connect ─────────►│  (token + nonce + device_id)
  │                         │
  │◄────── hello-ok ────────│  (认证成功)
```

### 支持的事件类型

| 事件 | 方向 | 说明 |
|------|------|------|
| `connect.challenge` | Server → Client | 认证挑战 |
| `connect` | Client → Server | 认证响应 |
| `hello-ok` | Server → Client | 认证成功 |
| `hello-fail` | Server → Client | 认证失败 |
| `message.send` | 双向 | 发送消息 |
| `message.reply` | 双向 | 回复消息 |
| `message.add` | Server → Client | 流式消息追加 |
| `message.done` | Server → Client | 流式消息完成 |
| `message.ack` | Server → Client | 消息送达确认 |
| `message.error` | Server → Client | 消息发送错误 |
| `typing.update` | Client → Server | 输入状态 |
| `ping` / `pong` | 双向 | 心跳 |

## 常用命令

```bash
# 激活 Agent
npm run activate YOUR_CODE

# 开发模式（自动重启）
npm run dev

# 构建生产版本
npm run build

# 运行生产版本
npm start

# 发送测试消息
npx tsx src/send-test.ts [conversation_id] [message]
```

## 故障排查

### WebSocket 连接 4001
同一个 `device_id` 被多个连接同时使用。确保每个实例使用唯一的 `CLAWCHAT_DEVICE_ID`。

### LLM 返回 503 model_not_found
检查模型名称是否正确。某些平台模型名格式可能不同（如 `agnes-2.0-flash` vs `agnes-flash-2.0`）。

### 激活时报 404
检查 `CLAWCHAT_BASE_URL` 是否正确（应该是 `https://app.clawling.com`，不带 `/api` 后缀）。

### 群聊中不回复
确认 `REQUIRE_MENTION_IN_GROUP=true` 时是否 @了 Agent，或 Agent 是否在 `GROUP_ALLOWLIST` 中。

## License

MIT
