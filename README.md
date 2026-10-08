# MetaMemory Agent Plugins

通过宿主原生插件接入 MetaMemory，提供跨会话记忆、召回与捕获。

## 安装与使用

- [Claude Code](docs/plugin-claude.md)
- [Codex](docs/plugin-codex.md)
- [OpenCode](docs/plugin-opencode.md)
- [OpenClaw](docs/plugin-openclaw.md)
- [Pi Agent](docs/plugin-pi.md)
- [DeepSeek Harness](docs/plugin-deepseek.md)
- [Hermes Agent](docs/plugin-hermes.md)
- [Remote MCP](docs/plugin-mcp.md)

## 连接配置

```bash
export METAMEM_API_KEY="你的MetaMemory组件Key"
export METAMEM_BACKEND_URL="https://metamemory.8-163-122-236.nip.io"
export METAMEM_MEMORY_COMPONENT="mem0_platform"
```

各宿主的工具、技能和配置方法见对应安装文档。

## 开源来源

插件基于 Mem0 官方宿主插件实现。各插件目录保留其 LICENSE 和 metamem-provenance.json，记录上游版本与源码来源。
