# Hermes Agent

为 Hermes Agent 提供外部长期记忆，与内置文件记忆共同工作。

## 工作原理

### 当前回合召回

回答前查询当前问题的相关记忆，并在原生等待窗口内注入上下文。

### 后台事实提取

回合结束后，在后台发送用户消息与回答。显式保存使用 `mem0_add`。

## 智能体工具

| 工具 | 用途 |
| --- | --- |
| `mem0_search` | 语义检索 |
| `mem0_add` | 保存指定事实 |
| `mem0_update` | 按 ID 更新内容 |
| `mem0_delete` | 按 ID 删除记忆 |

## 安装

使用支持独立 memory-provider 插件的 Hermes 和 Python 3.11+。

```bash
git clone https://github.com/FoxTamingPrince/metamemory-agent-plugins.git metamem-agent-plugins
```

```bash
export METAMEM_API_KEY="你的MetaMemory组件Key"
export METAMEM_BACKEND_URL="https://metamemory.8-163-122-236.nip.io"
export METAMEM_MEMORY_COMPONENT="mem0_platform"
```

```bash
hermes plugins install ./metamem-agent-plugins/integrations/hermes-plugin-metamem
hermes plugins enable metamem
hermes memory setup metamem
hermes memory status
```

## 平台配置

### 方式 1：交互向导（推荐）

```bash
hermes memory setup metamem
```

选择 Platform，填写 MetaMemory 组件 Key。开始新的 Hermes 会话。

### 方式 2：手动配置

```bash
hermes config set memory.provider metamem
```

在当前 profile 的 `.env` 中设置：

```dotenv
MEM0_API_KEY=你的MetaMemory组件Key
METAMEM_BACKEND_URL=https://metamemory.8-163-122-236.nip.io
METAMEM_MEMORY_COMPONENT=mem0_platform
```

当前 profile 的 `mem0.json`：

```json
{"mode":"platform","host":"","user_id":"alice"}
```

## 自托管服务配置

使用原生服务模式时，在 `mem0.json` 的 `host` 中填写服务 URL。该模式直接连接对应原生服务；连接 MetaMemory 的多个后端使用平台模式与 `METAMEM_MEMORY_COMPONENT`。

## 开源模式配置

交互向导选择 Open Source，并配置模型、embedding 和向量库；或在 `mem0.json` 中设置 `mode: "oss"` 与 `oss` 配置。

## 切换模式

更新当前 profile 的 `mode`、服务地址与凭据，然后新建会话。

## 配置

使用稳定 `user_id` 保持跨渠道记忆一致。不同 Hermes profile 使用各自配置与凭据。

## 迁移已有用户

保留原有用户身份、profile 和本地存储路径，选择独立 `metamem` provider。

## 可靠性

召回使用原生等待窗口，捕获在后台执行。通过工具结果与 `hermes memory status` 查看连接。

## 配置字段

配置文件位于当前 profile 的 `${HERMES_HOME}/mem0.json`。

| 参数 | 默认值 | 用途 |
| --- | --- | --- |
| `mode` | `platform` | `platform` 或 `oss` |
| `host` | 空 | 原生自托管服务地址 |
| `api_key` | 环境变量 | 组件 Key |
| `user_id` | 网关用户身份，其次 `hermes-user` | 记忆用户 |
| `agent_id` | `hermes` | 智能体身份 |
| `rerank` | `false` | 平台检索重排 |
| `sync_max_chars` | `450` | 后台同步文本字符上限 |
| `oss` | 空对象 | 本地模型、embedding 与向量库 |

非空文件配置优先于 `MEM0_MODE`、`MEM0_HOST`、`MEM0_USER_ID`、`MEM0_AGENT_ID`；文件中的 `api_key` 优先于 `MEM0_API_KEY`。

## 原生开源配置示例

```json
{
  "mode": "oss",
  "user_id": "alice",
  "oss": {
    "llm": {
      "provider": "openai",
      "config": {"model": "gpt-5-mini", "is_reasoning_model": true}
    },
    "embedder": {
      "provider": "openai",
      "config": {"model": "text-embedding-3-small"}
    },
    "vector_store": {
      "provider": "qdrant",
      "config": {"path": "~/.hermes/metamem-vector-store"}
    }
  }
}
```

模型凭据使用对应提供商的环境变量。可分别配置记忆模型与主对话模型。切换模式保留原有用户身份及存储路径；不同模式的记忆不会自动迁移。

## 工具参数与回合处理

| 工具 | 参数 |
| --- | --- |
| `mem0_search` | `query`、`top_k`；默认 10，上限 50 |
| `mem0_add` | `content`，原样保存 |
| `mem0_update` | `memory_id`、`text` |
| `mem0_delete` | `memory_id` |

回答前最多等待召回 3 秒，后台捕获在回合完成后执行。设置稳定的 `user_id` 可在不同渠道间共享个人记忆。
