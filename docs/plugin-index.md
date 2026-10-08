# MetaMemory Agent Plugins

为各宿主智能体提供跨会话记忆。选择对应宿主的安装指南。

## 宿主插件

| 宿主 | 插件 |
| --- | --- |
| Claude Code | `metamem@metamem-plugins` |
| Codex | `metamem@metamem-plugins` |
| OpenCode | `@metamem/opencode-plugin` |
| OpenClaw | `@metamem/openclaw-plugin` |
| Pi Agent | `@metamem/pi-plugin` |
| DeepSeek Harness | `@metamem/deepseek-plugin` |
| Hermes Agent | `hermes-plugin-metamem` |

## 配置

使用 MetaMemory 账号的组件 Key。SDK 服务地址为 `https://metamemory.8-163-122-236.nip.io`。`METAMEM_MEMORY_COMPONENT` 选择记忆组件，默认 `mem0_platform`。

记忆读写、管理与导入统一经过 MetaMemory。组件特有函数通过 MetaMemory 扩展接口调用；底层组件地址与凭据由服务端管理。

## 安装方式

完整插件提供宿主原生工具、技能和自动捕获／召回。独立 MCP 提供远程记忆工具，通过浏览器授权或组件 Key 登录。

- [Claude Code](plugin-claude.md)
- [Codex](plugin-codex.md)
- [OpenCode](plugin-opencode.md)
- [OpenClaw](plugin-openclaw.md)
- [Pi Agent](plugin-pi.md)
- [DeepSeek Harness](plugin-deepseek.md)
- [Hermes Agent](plugin-hermes.md)
- [MetaMemory MCP](plugin-mcp.md)
