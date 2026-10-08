# Codex

为 Codex 提供自动捕获、自动召回、搜索工具和六个记忆技能。

## 前置条件

- MetaMemory 账号与组件 Key。
- 支持插件和 MCP 的 Codex。
- Python 3.10+。

```bash
export METAMEM_API_KEY="你的MetaMemory组件Key"
export METAMEM_BACKEND_URL="https://metamemory.8-163-122-236.nip.io"
export METAMEM_MEMORY_COMPONENT="mem0_platform"
```

## 安装

### 方式 A：插件市场（推荐）

```bash
git clone https://github.com/FoxTamingPrince/metamemory-agent-plugins.git metamem-agent-plugins
```

```bash
codex plugin marketplace add ./metamem-agent-plugins
codex plugin add metamem@metamem-plugins
```

也可以添加市场后，在应用的插件目录中选择 MetaMemory Plugins 并安装 metamem。新建会话使插件生效。

### 方式 B：直接 MCP

```bash
codex mcp add metamem --url https://metamemory.8-163-122-236.nip.io/mcp/ --bearer-token-env-var METAMEM_API_KEY
```

或编辑 `~/.codex/config.toml`：

```toml
[mcp_servers.metamem]
url = "https://metamemory.8-163-122-236.nip.io/mcp/"
bearer_token_env_var = "METAMEM_API_KEY"
```

两种方式择一安装，避免重复注册。直接 MCP 提供远程工具；完整插件包含技能与生命周期钩子。

### 管理插件

```bash
codex plugin marketplace upgrade
codex plugin remove metamem@metamem-plugins
codex plugin marketplace remove metamem-plugins
```

## 包含的功能

| 功能 | 完整插件 | 直接 MCP |
| --- | --- | --- |
| 记忆搜索 | `search_memories` | 远程记忆工具 |
| 自动捕获和召回 | 有 | 由智能体显式调用工具 |
| 子智能体生命周期 | 有 | 无 |
| 六个记忆技能 | 有 | 无 |

## 直接 MCP 工具

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

## 生命周期钩子

| 事件 | 作用 |
| --- | --- |
| `SessionStart` | 初始化会话、恢复待提交捕获 |
| `UserPromptSubmit` | 记录提示并在首轮召回 |
| `PostToolUse` | 记录工具结果 |
| `SubagentStart` | 传递父会话记忆上下文 |
| `SubagentStop` | 记录子智能体完成结果 |
| `Stop` | 提交完成的工作 |
| `PreCompact` | 压缩前提交捕获 |
| `SessionEnd` | 提交剩余捕获 |

## 技能

`search`、`status`、`remember`、`forget`、`pause`、`resume`。

## 使用流程

1. 在项目中讨论架构选择，并完成相关代码工作。
2. 插件记录本轮完成的交互，后台提取项目事实和个人偏好。
3. 新建会话并继续同一项目，首次有效提示召回相关记忆。
4. 使用搜索技能主动查询，使用 remember 技能明确保存约定。

## 子智能体

Codex 使用原生子智能体。项目中的 `.codex/agents` 定义仍由 Codex 管理；插件记录子智能体开始、结束及完成结果。主会话继续负责检查并整合结果。

## Codex Cloud

云端会话使用远程 MCP 连接。在 Cloud 环境的环境变量中设置 `METAMEM_API_KEY`，使设置阶段与智能体阶段均可读取。只配置为 Secret 的值在设置结束后会移除，不能用于后续智能体的 MCP 请求。

完整插件与远程 MCP 是两种安装方式：完整插件提供本地捕获、技能和钩子；远程 MCP 提供记忆工具。
