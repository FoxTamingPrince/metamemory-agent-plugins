# Pi Agent

为 Pi Agent 提供自动捕获、语义召回、仓库范围管理与确认对话框。

## 概览

每轮对话前读取相关记忆，结束后捕获需要保存的信息。项目身份使用 Git 仓库根目录。

## 前置条件

Pi Agent、MetaMemory 账号与组件 Key。

```bash
export METAMEM_API_KEY="你的MetaMemory组件Key"
export METAMEM_BACKEND_URL="https://metamemory.8-163-122-236.nip.io"
export METAMEM_MEMORY_COMPONENT="mem0_platform"
```

## 安装

```bash
git clone https://github.com/FoxTamingPrince/metamemory-agent-plugins.git metamem-agent-plugins
```

```bash
pi install ./metamem-agent-plugins/integrations/pi-agent-plugin
```

新建 Pi 会话，运行 `/mem0-status`。

### 可选配置

在 `~/.pi/agent/mem0-config.json` 配置：

```json
{
  "apiKey": "你的MetaMemory组件Key",
  "userId": "alice",
  "autoCapture": true,
  "defaultScope": "project",
  "searchThreshold": 0.3
}
```

## 包含的功能

| 功能 | 用途 |
| --- | --- |
| `mem0_memory` | 查询、保存、浏览及删除记忆 |
| 六个命令和技能 | 显式记忆管理 |
| `agent_end` 捕获 | 完成一轮后提取事实 |
| 提示上下文 | 每轮注入记忆策略 |

## 命令

| 命令 | 用途 |
| --- | --- |
| `/mem0-remember` | 保存指定内容 |
| `/mem0-search` | 查询记忆 |
| `/mem0-tour` | 浏览记忆 |
| `/mem0-status` | 查看连接、身份与记忆数量 |
| `/mem0-scope` | 选择项目、会话或全局范围 |
| `/mem0-forget` | 查询并确认删除 |

## 记忆范围

`project` 为当前仓库；`session` 为当前会话；`global` 为当前用户。删除操作通过 Pi 原生对话框确认。

## 自动召回与捕获

自动召回服务当前问题；显式工具支持再次搜索。`autoCapture` 控制完成回合后的捕获。

## 配置默认值

| 参数 | 默认值 | 用途 |
| --- | --- | --- |
| `apiKey` | `MEM0_API_KEY` | 环境变量优先于配置文件 |
| `userId` | `MEM0_USER_ID` 或默认身份 | 个人记忆身份 |
| `autoCapture` | `true` | 自动捕获 |
| `defaultScope` | `project` | 显式工具默认范围 |
| `searchThreshold` | `0.3` | 检索相似度阈值 |

## 工具参数

| `mem0_memory` 动作 | 参数 |
| --- | --- |
| `search` | `query`，可选 `scope` |
| `add` | `content`，可选 `scope` |
| `get_all` | 可选 `scope` |
| `delete` | `memory_id`，可选 `scope` |
| `delete_all` | 可选 `scope` |

返回内容最多为 200 行或 50 KB。写入和删除需要 Pi 原生确认，取消确认不会修改记忆。

## 命令参数

| 命令 | 用法 |
| --- | --- |
| remember | `/mem0-remember <文本>`，原样保存 |
| search | `/mem0-search <查询>` |
| tour | `/mem0-tour [scope]`，按类别浏览 |
| forget | `/mem0-forget <查询>`，查询后确认删除 |
| scope | `/mem0-scope <project/session/global>` |
| status | `/mem0-status` |

自动召回与捕获始终使用项目范围。显式工具使用选择的范围；全局范围由用户通过命令或配置开启。自动捕获不写入顶层 `run_id`，会话范围工具只查询显式按该会话保存的记忆。
