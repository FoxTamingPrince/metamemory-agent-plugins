# MetaMemory MCP

通过 HTTPS 将记忆工具接入支持 MCP 的客户端。

## 前置条件

MetaMemory 账号；支持 Streamable HTTP 的 MCP 客户端。

## 快速安装

```bash
npx mcp-add --name metamem-mcp --type http --url "https://metamemory.8-163-122-236.nip.io/mcp" --clients "claude code,cursor,windsurf,vscode,opencode"
```

选择自己使用的客户端，重新启动使配置生效。

## 登录

### 方式 1：浏览器登录

客户端打开 MetaMemory 登录页面。填写邮箱和验证码，并确认授权。

### 方式 2：API Key

通过 `Authorization: Bearer <组件Key>` 连接。支持 `Token` 写法。

## 可用工具

| 工具 | 用途 |
| --- | --- |
| `add_memory` | 保存文本或对话 |
| `search_memories` | 语义检索 |
| `get_memories` | 分页浏览记忆 |
| `get_memory` | 按 ID 读取记忆 |
| `update_memory` | 更新记忆内容 |
| `delete_memory` | 删除单条记忆 |
| `delete_all_memories` | 删除指定范围的记忆 |
| `delete_entities` | 删除实体及其记忆 |
| `list_entities` | 列出用户、智能体、应用及运行实体 |
| `list_events` | 查看异步写入事件 |
| `get_event_status` | 查询异步事件状态 |

## 客户端配置

### Claude Desktop

在 Settings → Connectors 中添加自定义连接，URL 填写 `https://metamemory.8-163-122-236.nip.io/mcp`，随后完成浏览器授权。

### Claude Code

```bash
npx mcp-add --name metamem-mcp --type http --url "https://metamemory.8-163-122-236.nip.io/mcp" --clients "claude code"
```

### Codex

```toml
[mcp_servers.metamem]
url = "https://metamemory.8-163-122-236.nip.io/mcp"
bearer_token_env_var = "METAMEM_API_KEY"
```

### OpenCode

```json
{"mcp":{"metamem":{"type":"remote","url":"https://metamemory.8-163-122-236.nip.io/mcp","oauth":true}}}
```

### 选择记忆组件

默认 `mem0_platform`。自定义连接使用 `X-Metamem-Memory-Component` 请求头，或在 MCP URL 中设置 `?memory_component=hindsight`。SDK 的服务域名保持不变。

