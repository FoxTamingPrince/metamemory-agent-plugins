# OpenClaw

为 OpenClaw 提供长期记忆、技能提取、自动召回和显式记忆工具。

## 概览

插件通过 triage 选择需要保存的事实，回答前召回相关记忆。`autoRecall`、`autoCapture` 与技能模式可分别配置。

## 前置条件

OpenClaw 2026.4.25 或更高版本；MetaMemory 账号。

## 安装

在任意 OpenClaw 聊天入口发送：

```text
Setup MetaMemory from https://metamemory.8-163-122-236.nip.io/claw-setup
```

## 配置

### userId

使用稳定的个人身份，例如 `alice`。跨会话使用相同身份。

### 平台模式

#### 方式 1：聊天安装（推荐）

1. 发送上面的安装指令。
2. 提供邮箱。
3. 提供邮件中的六位验证码。
4. 插件保存账号组件 Key、用户 ID 与技能配置。

#### 方式 2：手动配置

```bash
git clone https://github.com/FoxTamingPrince/metamemory-agent-plugins.git metamem-agent-plugins
```

```bash
openclaw plugins install ./metamem-agent-plugins/integrations/openclaw-plugin
```

在 `openclaw.json` 中配置：

```json
{
  "plugins": {
    "slots": {"memory": "metamem"},
    "entries": {
      "metamem": {
        "enabled": true,
        "config": {
          "mode": "platform",
          "apiKey": "你的MetaMemory组件Key",
          "userId": "alice",
          "baseUrl": "https://metamemory.8-163-122-236.nip.io",
          "autoRecall": true,
          "autoCapture": true,
          "skills": {
            "triage": {"enabled": true},
            "recall": {"enabled": true}
          }
        }
      }
    }
  }
}
```

### 开源模式

#### 方式 1：交互配置

```bash
openclaw mem0 init --mode open-source
```

依次选择模型、embedding、向量库和用户 ID。

#### 方式 2：非交互配置

```bash
openclaw mem0 init --mode open-source --oss-llm ollama --oss-embedder ollama --oss-vector qdrant
```

#### 方式 3：手动配置

在 `openclaw.json` 中配置原生本地依赖：

```json
{
  "plugins": {
    "slots": {"memory": "metamem"},
    "entries": {
      "metamem": {
        "enabled": true,
        "config": {
          "mode": "open-source",
          "userId": "alice",
          "oss": {
            "llm": {
              "provider": "ollama",
              "config": {"model": "llama3.1:8b", "baseURL": "http://localhost:11434"}
            },
            "embedder": {
              "provider": "ollama",
              "config": {"model": "nomic-embed-text", "baseURL": "http://localhost:11434"}
            },
            "vectorStore": {
              "provider": "qdrant",
              "config": {"host": "localhost", "port": 6333, "collectionName": "metamem"}
            }
          }
        }
      }
    }
  }
}
```

平台后端选择使用 `METAMEM_MEMORY_COMPONENT`。

## 短期与长期记忆

`session` 表示会话记忆；`long-term` 表示跨会话记忆；`all` 同时查询两者。

## 智能体工具

| 工具 | 用途 |
| --- | --- |
| `memory_add` | 保存事实 |
| `memory_search` | 查询记忆 |
| `memory_get` | 读取单条记忆 |
| `memory_list` | 浏览记忆 |
| `memory_update` | 更新内容 |
| `memory_delete` | 删除指定记忆；全量删除需确认 |
| `memory_event_list` | 查看异步事件 |
| `memory_event_status` | 查询事件状态 |


## 插件管理

使用 `openclaw plugins` 管理安装、启用与移除；通过 `openclaw mem0 status` 查看记忆连接。

## 隐私与安全

平台模式向 MetaMemory 服务发送记忆操作。本地模式使用配置的模型与向量库。凭据保存在宿主配置中。

## 配置选项

| 参数 | 默认值 | 用途 |
| --- | --- | --- |
| `mode` | `platform` | 平台或 `open-source` |
| `userId` | 系统用户名 | 用户身份 |
| `autoRecall` | `true` | 回答前召回 |
| `autoCapture` | `true` | 自动捕获 |
| `topK` | `5` | 召回条数 |
| `searchThreshold` | `0.1` | 检索阈值 |
| `skills.triage.enabled` | `true` | 记忆分类 |
| `skills.recall.enabled` | `true` | 召回技能 |
| `skills.recall.tokenBudget` | `1500` | 召回 token 预算 |
| `skills.recall.rerank` | `true` | 重排 |
| `skills.recall.keywordSearch` | `true` | 关键词检索 |
| `skills.recall.identityAlwaysInclude` | `true` | 注入身份记忆 |
| `skills.domain` | `companion` | 技能域 |

平台配置使用 `apiKey`、`customInstructions`、`customCategories`。原生开源配置使用 `oss.embedder`、`oss.vectorStore`、`oss.llm` 和 `historyDbPath`。

## CLI 命令

```bash
openclaw mem0 add "项目使用 PostgreSQL"
openclaw mem0 search "项目数据库" --scope long-term
openclaw mem0 get <memory_id>
openclaw mem0 list --user-id alice --top-k 20
openclaw mem0 update <memory_id> "项目使用 PostgreSQL 17"
openclaw mem0 delete <memory_id>
openclaw mem0 delete --all --user-id alice --confirm
openclaw mem0 import memories.json
openclaw mem0 config show
openclaw mem0 config get api_key
openclaw mem0 config set user_id alice
openclaw mem0 event list
openclaw mem0 event status <event_id>
openclaw mem0 status
```

命令支持 `--json` 输出。升级插件使用 `openclaw plugins update metamem`。

## 开源初始化参数

```bash
openclaw mem0 init --mode open-source --oss-llm ollama
```

| 参数组 | 参数 |
| --- | --- |
| LLM | `--oss-llm`、`--oss-llm-key`、`--oss-llm-model`、`--oss-llm-url` |
| Embedding | `--oss-embedder`、`--oss-embedder-key`、`--oss-embedder-model`、`--oss-embedder-url` |
| 向量库 | `--oss-vector`、`--oss-vector-url`、`--oss-vector-host`、`--oss-vector-port` |
| 向量库凭据与结构 | `--oss-vector-user`、`--oss-vector-password`、`--oss-vector-dbname`、`--oss-vector-dims` |

原生开源模式直接使用所配置的模型与向量库。通过 MetaMemory 选择十一种后端时，使用平台模式与 `METAMEM_MEMORY_COMPONENT`。
