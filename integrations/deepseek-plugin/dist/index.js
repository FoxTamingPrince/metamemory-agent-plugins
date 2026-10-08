import { bindMetamemClient, metamemClientOptions } from "./metamem-transport.js";
// src/index.ts
import { defineTool } from "@deepseek-ai/dsh-tools";
import { MemoryClient } from "mem0ai";

// ../agent-plugin-core/typescript/src/formatting.ts
var MAX_OUTPUT_LINES = 200;
var MAX_OUTPUT_CHARS = 5e4;
function formatAge(date) {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 6e4);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}
function formatMemoryCompact(memory) {
  const category = memory.categories?.[0] ?? "uncategorized";
  const age = memory.createdAt ? ` (${formatAge(memory.createdAt)})` : "";
  return `[${category}] ${memory.memory ?? "(empty)"}${age} [mem0:${memory.id}]`;
}
function formatMemoryList(memories) {
  return memories.length ? memories.map((memory, index) => `${index + 1}. ${formatMemoryCompact(memory)}`).join("\n") : "No memories found.";
}
function formatAddResult(result) {
  const items = Array.isArray(result) ? result : result?.results ?? (result ? [result] : []);
  const pending = items.find((item) => item.status === "PENDING");
  if (pending) {
    const id = pending.eventId ?? pending.event_id;
    return `Memory queued for background extraction${id ? ` (event ${id})` : ""}; it will be searchable shortly.`;
  }
  if (!items.length) return "Memory stored.";
  return `Stored ${items.length} ${items.length === 1 ? "memory" : "memories"}:
${formatMemoryList(items)}`;
}
function truncateOutput(text, maxChars = MAX_OUTPUT_CHARS, maxLines = MAX_OUTPUT_LINES) {
  const lines = text.split("\n");
  if (lines.length <= maxLines && text.length <= maxChars) return text;
  const kept = lines.slice(0, maxLines);
  let result = kept.join("\n");
  const charCapped = result.length > maxChars;
  if (charCapped) result = result.slice(0, maxChars);
  const reasons = [];
  if (kept.length < lines.length) reasons.push(`showing ${kept.length} of ${lines.length} lines`);
  if (charCapped) reasons.push(`cut at ${Math.floor(maxChars / 1e3)}KB`);
  return `${result}

[Output truncated: ${reasons.join(", ")}]`;
}

// ../agent-plugin-core/typescript/src/identity.ts
var clean = (value) => value?.trim() || void 0;
function entitySearchFilters(params, defaultUserId) {
  const filters = { user_id: clean(params.userId) ?? defaultUserId };
  const agentId = clean(params.agentId);
  const runId = clean(params.runId);
  if (agentId) filters.agent_id = agentId;
  if (runId) filters.run_id = runId;
  return filters;
}
function entityAddParams(params, defaultUserId) {
  const values = { userId: clean(params.userId) ?? defaultUserId };
  const agentId = clean(params.agentId);
  const runId = clean(params.runId);
  if (agentId) values.agentId = agentId;
  if (runId) values.runId = runId;
  return values;
}

// src/telemetry.ts
import { randomUUID as randomUUID2 } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ../agent-plugin-core/typescript/src/telemetry.ts
import { randomUUID } from "crypto";

// ../agent-plugin-core/typescript/src/prompts.ts
var SEARCH_WHEN = "before repeating investigation or when earlier decisions, fixes, commands, or results may help";
var SEARCH_TOOL_DESCRIPTION = `Search memories from earlier work in this repository. Use it ${SEARCH_WHEN}.`;
var RECALL_HEADING = "Mem0 found these relevant memories from earlier work in this repository:";
var USER_SEARCH_TOOL_DESCRIPTION = `Search memories from earlier work. Use it ${SEARCH_WHEN}.`;
var USER_SEARCH_QUERY_DESCRIPTION = "A direct question about earlier work.";
var USER_RECALL_HEADING = "Mem0 found these relevant memories from earlier work:";

// ../agent-plugin-core/typescript/src/lifecycle.ts
var MAX_RECALL_QUERY_CHARS = 6e3;
var DEFAULT_MAX_CONTEXT_CHARS = 4e3;
var SECRET_PATTERNS = [
  [/(authorization\s*[:=]\s*(?:bearer|token)\s+)[^\s"']+/gi, "$1[REDACTED]"],
  [
    /((?:api[_-]?key|secret[_-]?access[_-]?key|session[_-]?token)\s*[:=]\s*)[^\s"']+/gi,
    "$1[REDACTED]"
  ],
  [
    /((?:access[_-]?token|refresh[_-]?token|password|credential)\s*[:=]\s*)[^\s&"']+/gi,
    "$1[REDACTED]"
  ],
  [/\b(?:sk|m0|mem0_sk|psk)-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED]"],
  [/\b(?:ASIA|AKIA)[A-Z0-9]{12,}\b/g, "[REDACTED]"],
  [/\b(?:ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{12,}\b/g, "[REDACTED]"],
  [/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[REDACTED]"]
];
function redactSecrets(value) {
  let text = typeof value === "string" ? value : JSON.stringify(value, null, 0) ?? String(value);
  for (const [pattern, replacement] of SECRET_PATTERNS) text = text.replace(pattern, replacement);
  return text;
}
function boundedText(value, limit) {
  const text = redactSecrets(value).trim();
  return text.length <= limit ? text : `${text.slice(0, limit)}
...[truncated ${text.length - limit} chars]`;
}
function extractText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const text = content.filter(
    (block) => typeof block === "object" && block !== null && block.type === "text" && typeof block.text === "string"
  ).map((block) => block.text).join("\n");
  return text || null;
}
function extractConversation(messages) {
  const conversation = [];
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = extractText(message.content);
    if (!text) continue;
    const content = redactSecrets(text).trim();
    if (content) conversation.push({ role: message.role, content });
  }
  return conversation;
}
var MemoryLifecycle = class {
  #seenMemoryIds = /* @__PURE__ */ new Set();
  #options;
  constructor(options = {}) {
    this.#options = options;
  }
  beginSession() {
    this.#seenMemoryIds.clear();
  }
  prepareConversation(messages) {
    return extractConversation(messages);
  }
  prepareUserText(value) {
    return redactSecrets(value).trim();
  }
  recall(prompt, enabled, search) {
    return buildRecallContext(prompt, enabled, search, {
      heading: this.#options.recallHeading,
      maxChars: this.#options.maxContextChars,
      seenIds: this.#seenMemoryIds,
      timeoutMs: this.#options.recallTimeoutMs
    });
  }
};
function createMemoryLifecycle(options = {}) {
  return new MemoryLifecycle(options);
}
async function buildRecallContext(prompt, enabled, search, options = {}) {
  if (!enabled) return "";
  const query = boundedText(prompt, MAX_RECALL_QUERY_CHARS);
  if (!query) return "";
  try {
    let timer;
    let response;
    try {
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), options.timeoutMs ?? 2e3);
      });
      response = await Promise.race([search(query), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!response) return "";
    const memories = response.results ?? [];
    const unseen = memories.filter((memory) => !options.seenIds?.has(memory.id));
    if (!unseen.length) return "";
    const prefix = `<mem0-relevant-memories>
${options.heading ?? RECALL_HEADING}
`;
    const suffix = "\n</mem0-relevant-memories>";
    const maxChars = options.maxChars ?? DEFAULT_MAX_CONTEXT_CHARS;
    const lines = [];
    for (const memory of unseen) {
      const line = `${lines.length + 1}. ${redactSecrets(formatMemoryCompact(memory)).replace(/\s+/g, " ").trim()}`;
      const candidate = prefix + [...lines, line].join("\n") + suffix;
      if (candidate.length > maxChars) {
        if (!lines.length) {
          const available = maxChars - prefix.length - suffix.length;
          if (available > 1) lines.push(`${line.slice(0, available - 1).trimEnd()}\u2026`);
        }
        break;
      }
      lines.push(line);
      options.seenIds?.add(memory.id);
    }
    if (!lines.length) return "";
    if (unseen[0] && !options.seenIds?.has(unseen[0].id)) options.seenIds?.add(unseen[0].id);
    return prefix + lines.join("\n") + suffix;
  } catch {
    return "";
  }
}

// ../agent-plugin-core/typescript/src/telemetry.ts
var POSTHOG_API_KEY = "phc_hgJkUVJFYtmaJqrvf6CYN67TIQ8yhXAkWzUn9AMU4yX";
var POSTHOG_BATCH_URL = "https://us.i.posthog.com/batch/";
var OFF_VALUES = /* @__PURE__ */ new Set(["false", "0", "no", "off"]);
var PRIVATE_KEYS = /* @__PURE__ */ new Set([
  "apikey",
  "authorization",
  "password",
  "query",
  "secret",
  "prompt",
  "token",
  "text",
  "memory",
  "message",
  "error",
  "path",
  "cwd",
  "userid",
  "agentid",
  "runid",
  "repoid",
  "repositoryid",
  "projectid",
  "appid",
  "filters"
]);
function isTelemetryEnabled() {
  const value = process.env.MEM0_TELEMETRY;
  return value === void 0 || !OFF_VALUES.has(value.toLowerCase());
}
function safeValue(value) {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(safeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => !PRIVATE_KEYS.has(key.toLowerCase().replace(/[^a-z]/g, ""))).map(([key, nested]) => [key, safeValue(nested)])
    );
  }
  return value;
}
function safeProperties(properties) {
  return safeValue(properties);
}
function errorKind(error) {
  const text = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (text.includes("timeout") || text.includes("aborted")) return "timeout";
  if (text.includes("401") || text.includes("403") || text.includes("unauthor")) return "auth";
  if (text.includes("429") || text.includes("rate limit")) return "rate-limited";
  if (/50[0234]/.test(text)) return "server-error";
  if (text.includes("400") || text.includes("422")) return "bad-request";
  if (text.includes("fetch failed") || text.includes("enotfound")) return "network";
  return error instanceof Error ? error.constructor.name : "other";
}
var RETRY_BACKOFF_CEILING_MS = 6e4;
var MAX_DELIVERY_ATTEMPTS = 5;
function createTelemetry(config) {
  let queue = [];
  let timer;
  let consecutiveFailures = 0;
  let retryNotBefore = 0;
  let exitFlushAttempted = false;
  let flushing = false;
  const flushThreshold = config.flushThreshold ?? 10;
  const maxQueueSize = config.maxQueueSize ?? 100;
  const deliver = config.delivery ?? (async (batch) => {
    const response = await fetch(POSTHOG_BATCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: POSTHOG_API_KEY, batch }),
      signal: AbortSignal.timeout(3e3)
    });
    if (!response.ok) throw new Error(`posthog responded ${response.status}`);
  });
  async function flush(force = false) {
    if (flushing) return;
    if (!queue.length) return;
    if (!force && Date.now() < retryNotBefore) return;
    const batch = queue;
    queue = [];
    flushing = true;
    try {
      await deliver(batch);
      consecutiveFailures = 0;
      retryNotBefore = 0;
    } catch {
      consecutiveFailures += 1;
      if (consecutiveFailures >= MAX_DELIVERY_ATTEMPTS) {
        consecutiveFailures = 0;
        retryNotBefore = 0;
        return;
      }
      queue = [...batch, ...queue].slice(0, maxQueueSize);
      retryNotBefore = Date.now() + Math.min(2 ** consecutiveFailures * 1e3, RETRY_BACKOFF_CEILING_MS);
    } finally {
      flushing = false;
    }
  }
  function beforeExit() {
    if (exitFlushAttempted) return;
    exitFlushAttempted = true;
    void flush(true);
  }
  function build(event, properties = {}) {
    if (!(config.enabled?.() ?? isTelemetryEnabled())) return null;
    try {
      const distinctId = typeof config.distinctId === "function" ? config.distinctId() : config.distinctId;
      if (!distinctId) return null;
      return {
        event: config.eventName?.(event) ?? event,
        distinct_id: distinctId,
        // Stamped once, at capture. This is what makes retrying safe: a batch
        // re-sent after a failure carries the same ids, so PostHog collapses
        // anything it already accepted instead of counting it twice.
        uuid: randomUUID(),
        // Capture time, not ingestion time. Events now sit through backoff and
        // across a whole outage, so without this PostHog records them whenever
        // delivery happened to succeed. It also matters for the uuid dedupe
        // above, whose key includes the event date.
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        properties: {
          ...safeProperties(properties),
          ...safeProperties(config.commonProperties ?? {}),
          host: config.host,
          source: config.source,
          language: "node",
          plugin_version: config.version,
          node_version: process.version,
          os: process.platform,
          $process_person_profile: false,
          $lib: "posthog-node"
        }
      };
    } catch {
      return null;
    }
  }
  function capture(event, properties = {}) {
    try {
      const payload = build(event, properties);
      if (!payload) return;
      if (queue.length >= maxQueueSize) return;
      queue.push(payload);
      if (!timer) {
        timer = setInterval(() => void flush(), config.flushIntervalMs ?? 5e3);
        timer.unref?.();
        process.on("beforeExit", beforeExit);
      }
      if (queue.length >= flushThreshold) void flush();
    } catch {
    }
  }
  function resetForTesting() {
    queue = [];
    consecutiveFailures = 0;
    retryNotBefore = 0;
    if (timer) clearInterval(timer);
    timer = void 0;
    process.off("beforeExit", beforeExit);
  }
  return { build, capture, flush, resetForTesting, queueForTesting: () => queue };
}

// src/telemetry.ts
var PLUGIN_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8")).version;
  } catch {
    return "unknown";
  }
})();
var cachedAnonymousId;
var identified = false;
var currentDistinctId = "";
function identityPath() {
  return path.join(os.homedir(), ".mem0", "deepseek-plugin-telemetry.json");
}
function anonymousId() {
  if (cachedAnonymousId) return cachedAnonymousId;
  try {
    const stored = JSON.parse(fs.readFileSync(identityPath(), "utf-8"));
    if (typeof stored.anonymousId === "string" && stored.anonymousId) {
      return cachedAnonymousId = stored.anonymousId;
    }
  } catch {
  }
  const created = `deepseek-anon-${randomUUID2().replace(/-/g, "")}`;
  try {
    fs.mkdirSync(path.dirname(identityPath()), { recursive: true });
    fs.writeFileSync(identityPath(), JSON.stringify({ anonymousId: created }), "utf-8");
  } catch {
  }
  return cachedAnonymousId = created;
}
function previousAnonymousId(distinctId) {
  if (identified || distinctId.startsWith("deepseek-anon-")) return void 0;
  identified = true;
  try {
    const stored = JSON.parse(fs.readFileSync(identityPath(), "utf-8")).anonymousId;
    fs.unlinkSync(identityPath());
    cachedAnonymousId = void 0;
    return typeof stored === "string" && stored ? stored : void 0;
  } catch {
    return void 0;
  }
}
var telemetry = createTelemetry({
  host: "deepseek",
  source: "DEEPSEEK_HARNESS",
  version: PLUGIN_VERSION,
  distinctId: () => currentDistinctId
});
function captureEvent(event, properties, client) {
  currentDistinctId = client.telemetryId || anonymousId();
  const anonymous = previousAnonymousId(currentDistinctId);
  if (anonymous) telemetry.capture("$identify", { $anon_distinct_id: anonymous });
  telemetry.capture(event, properties);
}

// src/index.ts
var name = "mem0";
var inject = ["tools", "systemPrompt"];
var SOURCE = "DEEPSEEK_HARNESS";
var DEFAULT_SEARCH_LIMIT = 10;
var AUTO_RECALL_LIMIT = 5;
var textOutput = {
  schema: { type: "string" },
  render: (_args, value) => [
    { type: "text", text: value }
  ]
};
var scopeParams = {
  userId: {
    type: "string",
    description: "Entity that owns the memory. Defaults to the plugin's configured userId; cross-user overrides require allowUserOverride in plugin configuration."
  },
  agentId: {
    type: "string",
    description: "Optional agent scope, to partition memories by agent."
  },
  runId: {
    type: "string",
    description: "Optional run/session scope, to partition memories by session."
  }
};
function apply(ctx, config) {
  const apiKey = config.apiKey ?? process.env.MEM0_API_KEY;
  if (!apiKey) {
    throw new Error("deepseek-plugin: set config.apiKey or the MEM0_API_KEY env var");
  }
  const userId = config.userId?.trim();
  if (!userId || /^\*+$/.test(userId)) {
    throw new Error("deepseek-plugin: config.userId is required");
  }
  const client = new MemoryClient(metamemClientOptions({
    apiKey,
    ...config.host ? { host: config.host } : {}
  }));
  bindMetamemClient(client);
  const toolLifecycle = createMemoryLifecycle();
  const sessionStates = /* @__PURE__ */ new WeakMap();
  const stateFor = (session) => {
    let state = sessionStates.get(session);
    if (!state) {
      const lifecycle = createMemoryLifecycle({ recallHeading: USER_RECALL_HEADING });
      lifecycle.beginSession();
      state = { lifecycle, messages: [] };
      sessionStates.set(session, state);
    }
    return state;
  };
  captureEvent("deepseek.plugin.mounted", {
    has_host: Boolean(config.host),
    auto_recall: config.autoRecall !== false,
    auto_capture: config.autoCapture !== false
  }, client);
  if (config.autoRecall !== false) {
    ctx.on("system-prompt/assemble", async (_input, context, next) => {
      const assembly = await next();
      const { agent, signal } = context;
      if (!agent || signal?.aborted) return assembly;
      const state = stateFor(agent.session);
      const prompt = state.lifecycle.prepareConversation(
        agent.session.deriveMessages().filter((message) => message.role === "user" && message.source?.kind === "user")
      ).at(-1)?.content;
      if (!prompt) return assembly;
      const memoryContext = await state.lifecycle.recall(prompt, true, async (query) => {
        const started = Date.now();
        try {
          const result = await client.search(query, {
            filters: entitySearchFilters({}, userId),
            topK: AUTO_RECALL_LIMIT
          });
          captureEvent("deepseek.recall.auto", {
            success: true,
            duration_ms: Date.now() - started,
            result_count: result.results?.length ?? 0
          }, client);
          return result;
        } catch (err) {
          captureEvent("deepseek.recall.auto", {
            success: false,
            duration_ms: Date.now() - started,
            error_kind: errorKind(err)
          }, client);
          throw err;
        }
      });
      if (!memoryContext || signal?.aborted) return assembly;
      return {
        ...assembly,
        contexts: [...assembly.contexts, { name: "mem0:recall", text: memoryContext }]
      };
    });
  }
  if (config.autoCapture !== false) {
    ctx.on("session/event", (session, event) => {
      const state = stateFor(session);
      if (event.type === "turn/start") {
        state.messages = [];
      } else if (event.type === "user/message" && event.data.source.kind === "user") {
        state.messages.push(event.data);
      } else if (event.type === "assistant/message") {
        state.messages.push(event.data.message);
      } else if (event.type === "turn/end") {
        const conversation = state.lifecycle.prepareConversation(state.messages);
        state.messages = [];
        if (event.data.reason.kind !== "completed" || conversation.length === 0) return;
        void client.add(conversation, { userId, source: SOURCE }).then(() => captureEvent("deepseek.capture.auto", {
          success: true,
          message_count: conversation.length
        }, client)).catch((err) => captureEvent("deepseek.capture.auto", {
          success: false,
          error_kind: errorKind(err)
        }, client));
      }
    });
  }
  ctx.tools.register(
    defineTool({
      name: "search_memory",
      description: USER_SEARCH_TOOL_DESCRIPTION,
      parameters: {
        query: { type: "string", description: USER_SEARCH_QUERY_DESCRIPTION, required: true },
        limit: {
          type: "integer",
          description: `Max results to return (default ${DEFAULT_SEARCH_LIMIT}).`
        },
        ...scopeParams
      },
      output: textOutput,
      async execute({ query, limit, userId: u, agentId, runId }) {
        if (u?.trim() && u.trim() !== userId && config.allowUserOverride !== true) {
          throw new Error("Cross-user access requires allowUserOverride in plugin configuration.");
        }
        const safeQuery = toolLifecycle.prepareUserText(query);
        const filters = entitySearchFilters({ userId: u, agentId, runId }, userId);
        const topK = limit && limit > 0 ? limit : DEFAULT_SEARCH_LIMIT;
        const started = Date.now();
        try {
          const { results } = await client.search(safeQuery, { filters, topK });
          captureEvent(
            "deepseek.tool.search_memory",
            {
              success: true,
              duration_ms: Date.now() - started,
              top_k: topK,
              result_count: results?.length ?? 0,
              query_chars: query.length,
              scope_overridden: Boolean(u && u !== userId),
              has_agent_id: Boolean(agentId),
              has_run_id: Boolean(runId)
            },
            client
          );
          return truncateOutput(formatMemoryList(results ?? []));
        } catch (err) {
          captureEvent(
            "deepseek.tool.search_memory",
            {
              success: false,
              duration_ms: Date.now() - started,
              top_k: topK,
              error_kind: errorKind(err)
            },
            client
          );
          return `search_memory failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
    })
  );
  ctx.tools.register(
    defineTool({
      name: "add_memory",
      description: "Store a fact in the user's long-term Mem0 memory for later sessions. Extraction runs asynchronously server-side, so a stored fact may take a moment to become searchable; do not immediately search to confirm the write.",
      parameters: {
        text: { type: "string", description: "The fact to remember.", required: true },
        ...scopeParams
      },
      output: textOutput,
      async execute({ text, userId: u, agentId, runId }) {
        if (u?.trim() && u.trim() !== userId && config.allowUserOverride !== true) {
          throw new Error("Cross-user access requires allowUserOverride in plugin configuration.");
        }
        const addParams = entityAddParams({ userId: u, agentId, runId }, userId);
        const started = Date.now();
        try {
          const result = await client.add(
            [{ role: "user", content: toolLifecycle.prepareUserText(text) }],
            {
              ...addParams,
              source: SOURCE
            }
          );
          captureEvent(
            "deepseek.tool.add_memory",
            {
              success: true,
              duration_ms: Date.now() - started,
              text_chars: text.length,
              memory_count: Array.isArray(result) ? result.length : 0,
              scope_overridden: Boolean(u && u !== userId),
              has_agent_id: Boolean(agentId),
              has_run_id: Boolean(runId)
            },
            client
          );
          return truncateOutput(formatAddResult(result));
        } catch (err) {
          captureEvent(
            "deepseek.tool.add_memory",
            {
              success: false,
              duration_ms: Date.now() - started,
              text_chars: text.length,
              error_kind: errorKind(err)
            },
            client
          );
          return `add_memory failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
    })
  );
}
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map