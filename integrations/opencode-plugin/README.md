# OpenCode

为 OpenCode 提供原生记忆工具、生命周期钩子与技能。

## 前置条件

MetaMemory 账号、组件 Key 和 OpenCode。

```bash
export METAMEM_API_KEY="你的MetaMemory组件Key"
export METAMEM_BACKEND_URL="https://metamemory.8-163-122-236.nip.io"
export METAMEM_MEMORY_COMPONENT="mem0_platform"
```

## 安装

### 方式 A：安装插件（推荐）

```bash
git clone https://github.com/FoxTamingPrince/metamemory-agent-plugins.git metamem-agent-plugins
```

```bash
opencode plugin ./metamem-agent-plugins/integrations/opencode-plugin
```

重新启动 OpenCode。插件自动登记原生工具、钩子与 `/mem0-*` 命令。

### 方式 B：独立 MCP

在项目或全局 `opencode.json` 中添加：

```json
{
  "mcp": {
    "metamem": {
      "type": "remote",
      "url": "https://metamemory.8-163-122-236.nip.io/mcp/",
      "headers": {"Authorization": "Token {env:METAMEM_API_KEY}"},
      "oauth": false
    }
  }
}
```

## 包含的功能

| 功能 | 插件 | 独立 MCP |
| --- | --- | --- |
| 记忆工具 | 原生 SDK 工具 | 远程工具 |
| 生命周期钩子 | 有 | 无 |
| 七个技能 | 有 | 无 |

## 可用记忆工具

`add_memory`、`search_memories`、`get_memories`、`get_memory`、`update_memory`、`delete_memory`、`delete_all_memories`、`delete_entities`、`list_entities`、`get_event_status`。

## 记忆范围

| 范围 | 用途 |
| --- | --- |
| `project` | 当前仓库 |
| `session` | 当前运行 |
| `global` | 当前用户的全部项目 |

通过 `/mem0-scope` 切换范围；`/mem0-context-loader` 载入上下文。全局删除要求显式指定全局范围。

## 命令

| 命令 | 用途 |
| --- | --- |
| `/mem0-remember` | 保存指定内容 |
| `/mem0-search` | 查询记忆 |
| `/mem0-tour` | 浏览记忆 |
| `/mem0-status` | 查看连接、身份与记忆数量 |
| `/mem0-scope` | 选择项目、会话或全局范围 |
| `/mem0-forget` | 查询并确认删除 |

## 生命周期钩子

| 事件 | 作用 |
| --- | --- |
| `config` | 注册命令与技能路径 |
| `chat.message` | 召回与选择性捕获 |
| `tool.execute.before` | 引导记忆写入工具 |
| `tool.execute.after` | 根据工具错误查询记忆 |
| `experimental.chat.messages.transform` | 注入记忆上下文 |
| `experimental.session.compacting` | 保存并恢复会话状态 |
| `shell.env` | 传递用户、项目与会话身份 |

## 范围参数

| `scope` | 记忆身份 | 用途 |
| --- | --- | --- |
| `project` | `user_id` + `app_id` | 当前仓库，默认范围 |
| `session` | 项目身份 + `run_id` | 当前会话 |
| `global` | `user_id` | 跨项目个人记忆 |

项目身份优先从 Git remote 取得，随后使用仓库根目录或工作目录。`/mem0-scope` 将选择保存到 `~/.mem0/settings.json` 的 `default_scope`；每次操作读取配置，无须重启。

全局范围由用户通过 `/mem0-scope global` 明确选择。全局删除仍需显式指定 `scope: "global"`。

## 自动捕获规则

会话开始及用户提示时执行召回。每第三条符合条件的用户提示触发自动捕获，保留脱敏后的完整用户文本。自动写入将会话标识存入 `metadata.session_id`；显式 session 工具通过 `run_id` 隔离。

| 钩子 | 用途 |
| --- | --- |
| `chat.message` | 提示召回与定期捕获 |
| `tool.execute.before` | 阻止以 MEMORY.md 文件替代记忆工具写入 |
| `tool.execute.after` | 根据 shell 错误检索相关处理经验 |
| 上下文转换 | 注入记忆与使用说明 |
| 上下文压缩 | 保存压缩前状态 |
| `shell.env` | 传递用户、项目、会话与分支身份 |
