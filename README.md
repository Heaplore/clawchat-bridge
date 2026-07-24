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