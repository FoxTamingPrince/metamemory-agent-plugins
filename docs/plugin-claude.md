# Claude Code

为 Claude Code 提供跨会话记忆、自动捕获、自动召回、搜索工具和记忆命令。

## 前置条件

- MetaMemory 账号与组件 Key。
- 支持插件、子智能体和 worktree 的 Claude Code。
- Python 3.10+、Git。

## 快速开始

下载插件目录：
```bash
git clone https://github.com/FoxTamingPrince/metamemory-agent-plugins.git metamem-agent-plugins
```

```bash
export METAMEM_API_KEY="你的MetaMemory组件Key"
export METAMEM_BACKEND_URL="https://metamemory.8-163-122-236.nip.io"
export METAMEM_MEMORY_COMPONENT="mem0_platform"
```

```bash
claude plugin marketplace add ./metamem-agent-plugins
claude plugin install metamem@metamem-plugins --scope user --config api_key="$METAMEM_API_KEY"
```

重新启动 Claude Code，或运行 `/reload-plugins`，然后进入 Git 仓库开始工作。

### 管理插件

```bash
claude plugin marketplace update metamem-plugins
claude plugin update metamem@metamem-plugins --scope user
claude plugin uninstall metamem@metamem-plugins
```

## 使用方式

### 自动记忆

钩子在本地记录用户消息、回答及工具结果，后台批量提取记忆；新会话的首次有效提示触发召回。

### 命令

| 命令 | 用途 |
| --- | --- |
| `/metamem:search` | 搜索；支持 `--top-k`、`--category`、`--scope`、`--run-id` |
| `/metamem:status` | 查看配置、捕获及后台写入状态 |
| `/metamem:forget` | 删除本项目中的个人记忆 |
| `/metamem:pause` | 暂停捕获 |
| `/metamem:resume` | 恢复捕获 |
| `/metamem:remember` | 指定需要记住的信息 |

### 搜索工具

`search_memories` 用于会话内显式查询。将问题作为查询文本，按项目或个人范围读取结果。

### Sidekick 智能体

`metamem:sidekick` 在独立 worktree 中执行任务，继承父会话召回的记忆。查看结果后，将需要的改动合入当前工作区。

## 工作原理

本地捕获 → 后台提取 → 下一会话召回。结束会话或压缩上下文时提交剩余捕获。

## 记忆范围

| 标识 | 用途 |
| --- | --- |
| `agent_id` | 共享项目记忆 |
| `user_id` | 个人记忆 |
| `app_id` | 仓库身份 |
| `run_id` | 会话身份 |

## 搜索范围

`repo` 搜索整个仓库；`dir` 聚焦当前目录；`mine` 聚焦个人记忆。

## 配置

| 字段 | 默认值 | 用途 |
| --- | --- | --- |
| `api_key` | 必填 | MetaMemory 组件 Key |
| `user_id` | 用户环境变量或系统用户名 | 个人记忆身份 |
| `search_scope` | `repo` | `repo`、`dir` 或 `mine` |
| `max_context_chars` | `4000` | 召回上下文字符预算，范围 1000–10000 |

使用 `METAMEM_MEMORY_COMPONENT` 选择记忆后端。`search_scope` 可通过 `MEM0_CODE_SEARCH_SCOPE` 设置。个人身份依次读取插件设置、`MEM0_CODE_USER_ID`、`MEM0_USER_ID`、`MEM0_RESOLVED_USER_ID`、`USER`、`USERNAME`，最后使用默认身份。

## 存储与发送的数据

捕获保存在本地；提取请求发往配置的 MetaMemory 服务。发送前按插件规则脱敏，用户消息与智能体回答保留各自角色。

## 自动捕获与召回

| 环节 | 行为 |
| --- | --- |
| 首次召回 | 新会话首次不少于 20 字符的提示触发查询，最多注入 5 条记忆 |
| 显式搜索 | `search_memories` 默认返回 3 条；`top_k` 范围 1–20 |
| 本地捕获 | 记录用户、回答、文件操作与工具结果；捕获阶段不调用模型 |
| 批量写入 | 每 5 个完成的交互提交一次，较大的捕获提前提交 |
| 空闲提交 | 默认 300 秒，可通过 `MEM0_CODE_IDLE_FLUSH_SECONDS` 配置 |
| 压缩与结束 | 提交剩余捕获；后台写入任务继续处理 |

用户陈述与智能体建议保留各自角色。项目记忆使用 `agent_id` 与 `app_id`，个人记忆使用 `user_id` 与 `app_id`；`run_id` 用于显式会话筛选。

## 搜索与删除示例

```text
/metamem:search 我们为什么选 PostgreSQL --scope repo --top-k 5
/metamem:search 我的代码风格偏好 --scope mine
/metamem:remember 本项目的数据库迁移必须支持回滚
/metamem:forget 旧数据库约定
```

删除共享项目记忆时，显式添加 `--include-project-memory`。

## Sidekick 工作流程

1. 将独立任务交给 `metamem:sidekick`。
2. Sidekick 在独立 worktree 中工作，并继承父会话召回的记忆。
3. 主会话查看完成结果，决定如何合入改动。

默认 worktree 基于主分支；配置 `worktree.baseRef=head` 可从当前提交创建。未提交的本地改动不会复制到新 worktree。

## 遥测

设置 `MEM0_TELEMETRY=false` 关闭遥测。原生遥测记录钩子、版本、系统信息、耗时与状态；仓库和会话标识经过加盐哈希，凭据会被脱敏。
