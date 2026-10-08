# DeepSeek Harness

为 DeepSeek Harness 提供原生记忆工具、回答前召回与完整回合捕获。

## 前置条件

DeepSeek Harness、MetaMemory 账号与组件 Key。

## 安装

```bash
git clone https://github.com/FoxTamingPrince/metamemory-agent-plugins.git metamem-agent-plugins
```

```bash
export METAMEM_API_KEY="你的MetaMemory组件Key"
export METAMEM_BACKEND_URL="https://metamemory.8-163-122-236.nip.io"
export METAMEM_MEMORY_COMPONENT="mem0_platform"
```

```bash
dsh plugin --profile headless add ./metamem-agent-plugins/integrations/deepseek-plugin
```

## 配置

在 Harness 的 Cordis 配置中注册已安装包：

```yaml
- name: "@deepseek-ai/dsh-system-prompt"
- name: "@deepseek-ai/dsh-tools"
- insert:
    - id: metamem
      name: "/你的DSH目录/profiles/headless/node_modules/@metamem/deepseek-plugin/dist/index.js"
      config:
        userId: alice
        host: https://metamemory.8-163-122-236.nip.io
        autoRecall: true
        autoCapture: true
```

使用同一 profile 加载该配置：

```bash
dsh web --patch ./cordis.yml
```

| 字段 | 用途 |
| --- | --- |
| `apiKey` | 组件 Key；可从 `MEM0_API_KEY` 或 `METAMEM_API_KEY` 读取 |
| `userId` | 必填，记忆所属用户 |
| `host` | MetaMemory 服务域名 |
| `allowUserOverride` | 是否允许调用时覆盖用户；默认关闭 |
| `autoRecall` | 回答前召回 |
| `autoCapture` | 完成回合后捕获 |

## 工作原理

完成的用户与智能体回合用于捕获，召回结果进入模型上下文。

## 智能体工具

| 工具 | 用途 |
| --- | --- |
| `search_memory` | 检索；可用 `agentId`、`runId` 缩小范围 |
| `add_memory` | 保存；可附加智能体与运行身份 |

## 记忆范围

自动捕获和召回使用配置的 `userId`。需要运行级记忆时，显式保存并查询同一 `runId`。

## 遥测

使用 `MEM0_TELEMETRY=false` 关闭原生插件遥测。

## 参数默认值

| 参数 | 默认值 | 配置方法 |
| --- | --- | --- |
| `apiKey` | 环境变量 | 可在 `config` 中显式设置 |
| `userId` | 必填 | 在 `config` 中设置稳定用户身份 |
| `allowUserOverride` | `false` | 控制工具是否允许覆盖用户身份 |
| `autoRecall` | `true` | 在模型回答前召回 |
| `autoCapture` | `true` | 在回合完成后捕获 |

将示例中的模块路径替换为该 profile 的实际安装路径；通过同一个 profile 启动 Harness。

## 生命周期

| 宿主事件 | 插件操作 |
| --- | --- |
| `system-prompt/assemble` | 在系统提示中加入相关记忆 |
| `session/event` | 捕获已经完成的对话回合 |
| `ctx.tools.register` | 注册 `add_memory` 与 `search_memory` |
| 卸载插件 | 移除注册的监听器 |

自动操作按 `userId` 保存和检索。显式工具可使用 `agentId`、`runId`；子智能体的 preset 需要同样加载插件。
