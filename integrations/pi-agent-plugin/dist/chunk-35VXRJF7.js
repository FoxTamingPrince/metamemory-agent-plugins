import { bindMetamemClient, metamemClientOptions } from "./metamem-transport.js";
import { metamemHost } from "./metamem-endpoint.js";
// src/entry.ts
import MemoryClient from "mem0ai";

// src/config/index.ts
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
var AGENT_ROOT = path.join(os.homedir(), ".pi", "agent");
var CONFIG_DIR = AGENT_ROOT;
var CONFIG_PATH = path.join(AGENT_ROOT, "mem0-config.json");
var DEFAULT_CONFIG = {
  apiKey: "",
  userId: "",
  autoCapture: true,
  defaultScope: "project",
  contextInjection: true,
  searchThreshold: 0.3
};
function loadConfig() {
  let fileConfig = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      fileConfig = JSON.parse(raw);
    } catch {
    }
  }
  const config = {
    ...DEFAULT_CONFIG,
    ...fileConfig
  };
  if (process.env.MEM0_API_KEY) {
    config.apiKey = process.env.MEM0_API_KEY;
  }
  if (process.env.MEM0_USER_ID) {
    config.userId = process.env.MEM0_USER_ID;
  }
  return config;
}

// src/memory/scoping.ts
import * as path2 from "path";
import * as crypto from "crypto";
import { execFileSync } from "child_process";

// ../agent-plugin-core/typescript/src/scoping.ts
function resolveToolScope(requested, configured) {
  const scope = requested ?? configured;
  if (scope === "global" && configured !== "global") {
    throw new Error("Select global scope in the plugin settings or /mem0-scope command first.");
  }
  return scope;
}
function validateContext(scope, context) {
  const keys = ["userId"];
  if (scope !== "global") keys.push("appId");
  if (scope === "session") keys.push("runId");
  for (const key of keys) {
    if (!context[key]?.trim() || /^\*+$/.test(context[key].trim())) {
      throw new Error(`Invalid memory scope ${key}`);
    }
  }
}
function scopeSearchFilters(scope, context) {
  validateContext(scope, context);
  if (scope === "session") {
    return { user_id: context.userId, app_id: context.appId, run_id: context.runId };
  }
  return scope === "global" ? { user_id: context.userId } : { user_id: context.userId, app_id: context.appId };
}
function scopeAddParams(scope, context) {
  validateContext(scope, context);
  if (scope === "session") {
    return { userId: context.userId, appId: context.appId, runId: context.runId };
  }
  return scope === "global" ? { userId: context.userId } : { userId: context.userId, appId: context.appId };
}

// src/memory/scoping.ts
function detectAppId(cwd) {
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf-8",
      timeout: 3e3,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return path2.basename(root);
  } catch {
    return path2.basename(cwd);
  }
}
function detectRunId(sessionFile) {
  if (!sessionFile) return "unknown";
  return crypto.createHash("sha256").update(sessionFile).digest("hex").slice(0, 12);
}
function resolveSearchFilters(scope, ctx) {
  return scopeSearchFilters(scope, ctx);
}
function resolveAddParams(scope, ctx) {
  return scopeAddParams(scope, ctx);
}

// ../agent-plugin-core/typescript/src/prompts.ts
var SEARCH_WHEN = "before repeating investigation or when earlier decisions, fixes, commands, or results may help";
var SEARCH_TOOL_DESCRIPTION = `Search memories from earlier work in this repository. Use it ${SEARCH_WHEN}.`;
var SEARCH_QUERY_DESCRIPTION = "A direct question about earlier work in this repository.";
var RECALL_HEADING = "Mem0 found these relevant memories from earlier work in this repository:";
var USER_SEARCH_TOOL_DESCRIPTION = `Search memories from earlier work. Use it ${SEARCH_WHEN}.`;

// src/memory/tools.ts
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";

// src/types.ts
var DEFAULT_CUSTOM_CATEGORIES = [
  { identity: "Personal details, background, and self-descriptions" },
  { preferences: "Likes, dislikes, habits, and preferred ways of doing things" },
  { goals: "Objectives, aspirations, and targets the user is working toward" },
  { projects: "Ongoing work, initiatives, and areas of focus" },
  { decisions: "Choices made, rationale, and trade-offs considered" },
  { technical: "Technical knowledge, tools, configurations, and environment details" },
  { relationships: "People, teams, organizations, and their roles" },
  { routines: "Recurring patterns, workflows, schedules, and processes" },
  { lessons: "Insights learned, mistakes to avoid, and best practices discovered" },
  { work: "Professional context, role, responsibilities, and work environment" }
];

// ../agent-plugin-core/typescript/src/formatting.ts
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
function groupByCategory(memories) {
  const groups = /* @__PURE__ */ new Map();
  for (const memory of memories) {
    const category = memory.categories?.[0] ?? "uncategorized";
    groups.set(category, [...groups.get(category) ?? [], memory]);
  }
  return groups;
}

// src/telemetry.ts
import { createHash as createHash2, randomUUID as randomUUID2 } from "crypto";
import * as fs2 from "fs";
import * as path3 from "path";

// ../agent-plugin-core/typescript/src/telemetry.ts
import { randomUUID } from "crypto";

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
      const distinctId2 = typeof config.distinctId === "function" ? config.distinctId() : config.distinctId;
      if (!distinctId2) return null;
      return {
        event: config.eventName?.(event) ?? event,
        distinct_id: distinctId2,
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
    return JSON.parse(fs2.readFileSync(new URL("../package.json", import.meta.url), "utf-8")).version;
  } catch {
    return "unknown";
  }
})();
var TELEMETRY_ID_PATH = path3.join(CONFIG_DIR, "mem0-telemetry-id.json");
var cachedAnonymousId;
var currentDistinctId = "";
var identified = false;
function anonymousId() {
  if (cachedAnonymousId) return cachedAnonymousId;
  try {
    const stored = JSON.parse(fs2.readFileSync(TELEMETRY_ID_PATH, "utf-8")).anonymousId;
    if (typeof stored === "string" && stored) return cachedAnonymousId = stored;
  } catch {
  }
  const created = `pi-mem0-anon-${randomUUID2().replace(/-/g, "")}`;
  try {
    fs2.mkdirSync(CONFIG_DIR, { recursive: true });
    fs2.writeFileSync(TELEMETRY_ID_PATH, JSON.stringify({ anonymousId: created }), "utf-8");
  } catch {
  }
  return cachedAnonymousId = created;
}
function distinctId(apiKey) {
  return apiKey ? createHash2("sha256").update(apiKey).digest("hex") : anonymousId();
}
function previousAnonymousId(id) {
  if (identified || id.startsWith("pi-mem0-anon-")) return void 0;
  identified = true;
  try {
    const stored = JSON.parse(fs2.readFileSync(TELEMETRY_ID_PATH, "utf-8")).anonymousId;
    fs2.unlinkSync(TELEMETRY_ID_PATH);
    cachedAnonymousId = void 0;
    return typeof stored === "string" && stored ? stored : void 0;
  } catch {
    return void 0;
  }
}
var telemetry = createTelemetry({
  host: "pi",
  source: "PI_AGENT_PLUGIN",
  version: PLUGIN_VERSION,
  distinctId: () => currentDistinctId
});
function captureEvent(eventName, properties = {}, context) {
  currentDistinctId = distinctId(context?.apiKey);
  const anonymous = previousAnonymousId(currentDistinctId);
  if (anonymous) telemetry.capture("$identify", { $anon_distinct_id: anonymous });
  telemetry.capture(eventName, properties);
}
function captureToolEvent(action, properties = {}, context) {
  captureEvent("pi.tool.mem0_memory", { action, ...properties }, context);
}
function captureCommandEvent(command, properties = {}, context) {
  captureEvent(`pi.command.${command}`, properties, context);
}
function _getEventQueue() {
  return telemetry.queueForTesting();
}
function _resetForTesting() {
  telemetry.resetForTesting();
  cachedAnonymousId = void 0;
  currentDistinctId = "";
  identified = false;
}

// src/memory/tools.ts
var MAX_OUTPUT_LINES = 200;
var MAX_OUTPUT_BYTES = 5e4;
function normalizeMemoryId(id) {
  return id.replace(/^\[?mem0:([0-9a-f-]{36})\]?$/i, "$1");
}
function truncateOutput(text) {
  const lines = text.split("\n");
  if (lines.length <= MAX_OUTPUT_LINES && text.length <= MAX_OUTPUT_BYTES) {
    return text;
  }
  const kept = lines.slice(0, MAX_OUTPUT_LINES);
  let result = kept.join("\n");
  if (result.length > MAX_OUTPUT_BYTES) {
    result = result.slice(0, MAX_OUTPUT_BYTES);
  }
  const dropped = lines.length - kept.length;
  if (dropped > 0 || text.length > MAX_OUTPUT_BYTES) {
    result += `

[Output truncated: showing ${kept.length} of ${lines.length} lines]`;
  }
  return result;
}
function buildToolExecute(mem0, scopeCtx, defaultScope) {
  return async (params, signal) => {
    const scope = resolveToolScope(params.scope, defaultScope);
    switch (params.action) {
      case "search": {
        if (signal?.aborted) throw new Error("Cancelled");
        if (!params.query) throw new Error("query is required for search");
        const filters = resolveSearchFilters(scope, scopeCtx);
        const result = await mem0.search(params.query, { filters });
        const memories = result.results ?? [];
        return {
          content: [{ type: "text", text: truncateOutput(formatMemoryList(memories)) }],
          details: { matchCount: memories.length }
        };
      }
      case "add": {
        if (signal?.aborted) throw new Error("Cancelled");
        if (!params.content) throw new Error("content is required for add");
        const addParams = resolveAddParams(scope, scopeCtx);
        const result = await mem0.add(
          [{ role: "user", content: params.content }],
          { ...addParams, customCategories: DEFAULT_CUSTOM_CATEGORIES }
        );
        const res = result;
        const msg = res.message ?? "Memory stored.";
        return {
          content: [{ type: "text", text: msg }],
          details: { eventId: res.eventId ?? null, status: res.status ?? null }
        };
      }
      case "get_all": {
        if (signal?.aborted) throw new Error("Cancelled");
        const filters = resolveSearchFilters(scope, scopeCtx);
        const result = await mem0.getAll({ filters });
        const memories = result.results ?? [];
        return {
          content: [{ type: "text", text: truncateOutput(formatMemoryList(memories)) }],
          details: { totalCount: result.count ?? memories.length }
        };
      }
      case "update": {
        if (signal?.aborted) throw new Error("Cancelled");
        if (!params.memory_id) throw new Error("memory_id is required for update");
        if (!params.content) throw new Error("content is required for update");
        const memoryId = normalizeMemoryId(params.memory_id);
        const updateResult = await mem0.update(memoryId, { text: params.content });
        const res = updateResult;
        return {
          content: [{ type: "text", text: res.status ?? "Memory updated." }],
          details: { memoryId }
        };
      }
      case "delete": {
        if (signal?.aborted) throw new Error("Cancelled");
        if (!params.memory_id) throw new Error("memory_id is required for delete");
        const result = await mem0.delete(normalizeMemoryId(params.memory_id));
        return {
          content: [{ type: "text", text: result.message ?? "Memory deleted." }],
          details: {}
        };
      }
      case "delete_all": {
        if (signal?.aborted) throw new Error("Cancelled");
        const delParams = resolveAddParams(scope, scopeCtx);
        const result = await mem0.deleteAll(delParams);
        return {
          content: [{ type: "text", text: result.message ?? "All memories deleted." }],
          details: {}
        };
      }
    }
  };
}
function registerMemoryTool(pi, mem0, config, getScopeCtx, telemetryCtx) {
  pi.registerTool({
    name: "mem0_memory",
    label: "Mem0 Memory",
    description: `Search, add, update, and manage persistent semantic memories powered by Mem0. Memories persist across sessions and devices. Use action "search" ${SEARCH_WHEN}. Output is truncated to 200 lines / 50KB.`,
    promptSnippet: "Semantic memory search and storage via Mem0",
    promptGuidelines: [
      `Use mem0_memory with action "search" ${SEARCH_WHEN}`,
      'Use mem0_memory with action "add" to save important facts, preferences, goals, decisions, or lessons the user shares',
      'Use mem0_memory with action "update" to modify an existing memory \u2014 requires memory_id and content. Preserves the memory ID',
      'Always use the default project scope unless the user EXPLICITLY asks to search across all projects \u2014 only after the user selects /mem0-scope global use scope "global"',
      "Do NOT pass scope at all for normal queries \u2014 omitting it uses the project default automatically"
    ],
    parameters: Type.Object({
      action: StringEnum(
        [
          "search",
          "add",
          "get_all",
          "update",
          "delete",
          "delete_all"
        ],
        {
          description: `Memory operation to run: "search" (semantic recall of earlier work in this repository), "add" (save a new fact/preference/decision), "get_all" (list everything in scope, no query needed), "update" (replace an existing memory's text by id), "delete" (remove one memory by id), "delete_all" (wipe every memory in the scope -- destructive, only on explicit request).`
        }
      ),
      query: Type.Optional(
        Type.String({
          description: `Search text -- required for action "search". ${SEARCH_QUERY_DESCRIPTION}`
        })
      ),
      content: Type.Optional(
        Type.String({
          description: 'Memory text -- required for action "add" (the fact to store) and "update" (the replacement text).'
        })
      ),
      memory_id: Type.Optional(
        Type.String({
          description: `Target memory's ID -- required for "update" and "delete". Use an ID returned by a prior "search" or "get_all".`
        })
      ),
      scope: Type.Optional(
        StringEnum(["project", "session", "global"], {
          description: 'Where to read/write: "project" (default -- this repo), "session" (this run only), or "global" (across ALL projects; only when the user explicitly wants cross-project recall). Omit for normal queries.'
        })
      )
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const scopeCtx = getScopeCtx();
      const exec = buildToolExecute(mem0, scopeCtx, config.defaultScope);
      const start = Date.now();
      try {
        const result = await exec(params, signal);
        const details = result.details ?? {};
        captureToolEvent(params.action, {
          success: true,
          latency_ms: Date.now() - start,
          result_count: details.matchCount ?? details.totalCount ?? void 0
        }, telemetryCtx);
        return result;
      } catch (err) {
        captureToolEvent(params.action, {
          success: false,
          latency_ms: Date.now() - start,
          error_type: err instanceof Error ? err.name : "unknown"
        }, telemetryCtx);
        throw err;
      }
    }
  });
}

// src/attribution.ts
import * as fs3 from "fs";
var PLATFORM_SOURCE = "PI_AGENT";
var PLATFORM_APPLICATION = "pi";
var PLUGIN_VERSION2 = (() => {
  try {
    return JSON.parse(
      fs3.readFileSync(new URL("../package.json", import.meta.url), "utf-8")
    ).version;
  } catch {
    return "unknown";
  }
})();
var MAX_STACK_ENTRIES = 4;
var MAX_STACK_CHARS = 200;
function boundedStack(callerEntries, own) {
  const kept = [];
  let budget = MAX_STACK_CHARS - own.length;
  for (const entry of callerEntries.slice(0, MAX_STACK_ENTRIES - 1)) {
    const cost = entry.length + ", ".length;
    if (cost > budget) break;
    budget -= cost;
    kept.push(entry);
  }
  return [...kept, own].join(", ");
}
function applySurfaceHeaders(client) {
  const headers = client.headers;
  if (!headers["X-Mem0-Source"]?.trim()) headers["X-Mem0-Source"] = PLATFORM_SOURCE;
  if (!headers["X-Application"]?.trim()) headers["X-Application"] = PLATFORM_APPLICATION;
  const existing = (headers["X-Mem0-Client"] ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  headers["X-Mem0-Client"] = boundedStack(existing, `mem0-pi-agent/${PLUGIN_VERSION2}`);
}

// src/commands.ts
var SEARCH_TOP_K = 10;
function registerCommands(pi, mem0, config, getScopeCtx, telemetryCtx) {
  const sendFeedback = (customType, content) => {
    pi.sendMessage({ customType, content, display: true });
  };
  const pluralize = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const searchMemories = async (query, scope) => {
    const filters = resolveSearchFilters(scope, getScopeCtx());
    const result = await mem0.search(query, {
      filters,
      threshold: config.searchThreshold,
      topK: SEARCH_TOP_K,
      rerank: true,
      source: PLATFORM_SOURCE
      // Widened by exactly this one property. `source` reaches the wire via the
      // SDK's camelToSnakeKeys spread, but it is absent from SearchMemoryOptions
      // in the published mem0ai types. A blanket `as never` would also disable
      // checking of filters, threshold, topK and rerank above.
    });
    return result.results ?? [];
  };
  pi.registerCommand("mem0-remember", {
    description: "Store a memory verbatim (no inference)",
    handler: async (args, ctx) => {
      const text = args?.trim();
      if (!text) {
        ctx.ui.notify("Usage: /mem0-remember <text>", "warning");
        return;
      }
      const addParams = resolveAddParams(config.defaultScope, getScopeCtx());
      const result = await mem0.add(
        [{ role: "user", content: text }],
        { ...addParams, customCategories: DEFAULT_CUSTOM_CATEGORIES, infer: false, source: PLATFORM_SOURCE }
      );
      captureCommandEvent("mem0-remember", {}, telemetryCtx);
      const storedItems = (Array.isArray(result) ? result : []).map((m) => m.memory).filter((m) => Boolean(m));
      const items = storedItems.length > 0 ? storedItems : [text];
      sendFeedback(
        "mem0-remember",
        [`**Stored to ${config.defaultScope} memory**`, ...items.map((m) => `- ${m}`)].join("\n")
      );
    }
  });
  pi.registerCommand("mem0-forget", {
    description: "Delete memories matching a natural language query",
    handler: async (args, ctx) => {
      const query = args?.trim();
      if (!query) {
        ctx.ui.notify("Usage: /mem0-forget <query>", "warning");
        return;
      }
      const memories = await searchMemories(query, config.defaultScope);
      if (memories.length === 0) {
        captureCommandEvent("mem0-forget", { result_count: 0 }, telemetryCtx);
        sendFeedback("mem0-forget", `**No matches for "${query}"** \u2014 nothing to forget.`);
        return;
      }
      const forgotten = (mem) => {
        captureCommandEvent("mem0-forget", { deleted_count: 1 }, telemetryCtx);
        sendFeedback(
          "mem0-forget",
          [`**Forgotten from ${config.defaultScope} memory**`, `- ${formatMemoryCompact(mem)}`].join("\n")
        );
      };
      if (memories.length === 1) {
        const target2 = memories[0];
        const confirmed = await ctx.ui.confirm("Delete this memory?", formatMemoryCompact(target2));
        if (!confirmed) {
          sendFeedback("mem0-forget", "**Cancelled** \u2014 no memories deleted.");
          return;
        }
        await mem0.delete(target2.id);
        forgotten(target2);
        return;
      }
      const labels = memories.map((m) => formatMemoryCompact(m));
      const selected = await ctx.ui.select(
        `Found ${pluralize(memories.length, "match", "matches")} for "${query}" \u2014 which should I delete?`,
        labels
      );
      if (!selected) {
        sendFeedback("mem0-forget", "**Cancelled** \u2014 no memories deleted.");
        return;
      }
      const idx = labels.indexOf(selected);
      if (idx < 0) return;
      const target = memories[idx];
      await mem0.delete(target.id);
      forgotten(target);
    }
  });
  pi.registerCommand("mem0-search", {
    description: "Semantic search across memories",
    handler: async (args, ctx) => {
      const query = args?.trim();
      if (!query) {
        ctx.ui.notify("Usage: /mem0-search <query>", "warning");
        return;
      }
      const memories = await searchMemories(query, config.defaultScope);
      captureCommandEvent("mem0-search", { result_count: memories.length }, telemetryCtx);
      if (memories.length === 0) {
        sendFeedback("mem0-search", `**No matches for "${query}"** \xB7 ${config.defaultScope} scope`);
        return;
      }
      sendFeedback(
        "mem0-search",
        [
          `**${pluralize(memories.length, "match", "matches")} for "${query}"** \xB7 ${config.defaultScope} scope`,
          "",
          formatMemoryList(memories)
        ].join("\n")
      );
    }
  });
  pi.registerCommand("mem0-tour", {
    description: "Browse all memories grouped by category",
    handler: async (args, ctx) => {
      const raw = args?.trim().toLowerCase();
      const validScopes = ["project", "session", "global"];
      if (raw && !validScopes.includes(raw)) {
        ctx.ui.notify(`Invalid scope "${raw}". Must be one of: ${validScopes.join(", ")}`, "warning");
        return;
      }
      const scope = raw || config.defaultScope;
      const filters = resolveSearchFilters(scope, getScopeCtx());
      const result = await mem0.getAll({ filters });
      const memories = result.results ?? [];
      if (memories.length === 0) {
        captureCommandEvent("mem0-tour", { memory_count: 0, scope }, telemetryCtx);
        sendFeedback("mem0-tour", `**No memories in ${scope} scope yet** \u2014 store one with \`/mem0-remember\`.`);
        return;
      }
      const groups = groupByCategory(memories);
      const lines = [
        `**Memory tour** \xB7 ${pluralize(memories.length, "memory", "memories")} \xB7 ${scope} scope`,
        ""
      ];
      for (const [category, items] of groups) {
        lines.push(`### ${category} (${items.length})`);
        for (const m of items) {
          lines.push(`- ${formatMemoryCompact(m)}`);
        }
        lines.push("");
      }
      captureCommandEvent("mem0-tour", { memory_count: memories.length, scope }, telemetryCtx);
      sendFeedback("mem0-tour", lines.join("\n"));
    }
  });
  pi.registerCommand("mem0-scope", {
    description: "Change default memory scope for this session (project, session, global)",
    handler: async (args, ctx) => {
      const scope = args?.trim().toLowerCase();
      const valid = ["project", "session", "global"];
      if (!scope) {
        sendFeedback(
          "mem0-scope",
          [
            `**Current scope: ${config.defaultScope}**`,
            `New memories save to the **${config.defaultScope}** pool. Switch with \`/mem0-scope <${valid.join(" | ")}>\`.`
          ].join("\n")
        );
        return;
      }
      if (!valid.includes(scope)) {
        ctx.ui.notify(`Invalid scope "${scope}". Must be one of: ${valid.join(", ")}`, "warning");
        return;
      }
      config.defaultScope = scope;
      captureCommandEvent("mem0-scope", { scope }, telemetryCtx);
      sendFeedback(
        "mem0-scope",
        [
          `**Scope changed to ${scope}**`,
          `New memories now save to the **${scope}** pool for this session.`
        ].join("\n")
      );
    }
  });
  pi.registerCommand("mem0-status", {
    description: "Show connection health, identity, project, and memory count",
    handler: async (_args, _ctx) => {
      const scopeCtx = getScopeCtx();
      const filters = resolveSearchFilters("project", scopeCtx);
      let count = 0;
      let connected = false;
      try {
        const result = await mem0.getAll({ filters });
        count = result.count ?? (result.results ?? []).length;
        connected = true;
      } catch {
        connected = false;
      }
      const lines = [
        "**Mem0 status**",
        "",
        `- Connection: ${connected ? "connected" : "disconnected"}`,
        `- User: ${scopeCtx.userId}`,
        `- Project: ${scopeCtx.appId}`,
        `- Session: ${scopeCtx.runId}`,
        `- Default scope: ${config.defaultScope}`,
        `- Search relevance threshold: ${config.searchThreshold}`,
        `- Project memories: ${count}`,
        `- Auto-capture: ${config.autoCapture ? "on" : "off"}`
      ];
      captureCommandEvent("mem0-status", { connected, memory_count: count }, telemetryCtx);
      sendFeedback("mem0-status", lines.join("\n"));
    }
  });
}

// src/capture/index.ts
function setupAutoCapture(pi, mem0, config, getScopeCtx, telemetryCtx, lifecycle = createMemoryLifecycle()) {
  if (!config.autoCapture) return;
  pi.on("agent_end", async (event) => {
    const messages = event.messages ?? [];
    const conversation = lifecycle.prepareConversation(messages);
    if (conversation.length === 0) return;
    const scopeCtx = getScopeCtx();
    const addParams = resolveAddParams("project", scopeCtx);
    try {
      await mem0.add(conversation, {
        ...addParams,
        customCategories: DEFAULT_CUSTOM_CATEGORIES
      });
      captureEvent("pi.capture.auto", { success: true, message_count: conversation.length }, telemetryCtx);
    } catch (err) {
      captureEvent("pi.capture.auto", {
        success: false,
        error_type: err instanceof Error ? err.name : "unknown"
      }, telemetryCtx);
      console.error("[mem0] auto-capture failed:", err);
    }
  });
}

// src/prompt.ts
var MEMORY_POLICY = `<mem0-memory-policy>
You have persistent semantic memory via the mem0_memory tool, powered by Mem0. Relevant memories may be auto-injected under <mem0-relevant-memories>.

Use mem0_memory with action "search" ${SEARCH_WHEN}.

Be proactive about saving:
- Save important facts, preferences, goals, decisions, lessons learned, identity, relationships, and routines the user shares.

Scope (do not change unless explicitly asked):
- "project" (default): memories for this project \u2014 use for all normal queries
- "session": memories from this session only
- "global": all memories across projects \u2014 ONLY when the user explicitly asks for cross-project search

Memory persists across sessions and devices via Mem0's cloud.
</mem0-memory-policy>`;

// src/entry.ts
import * as os2 from "os";
function resolveUserId(configUserId) {
  if (configUserId) return configUserId;
  if (process.env.USER) return process.env.USER;
  if (process.env.USERNAME) return process.env.USERNAME;
  try {
    return os2.userInfo().username;
  } catch {
    return "default";
  }
}
function mem0Extension(pi) {
  const config = loadConfig();
  if (!config.apiKey) {
    console.warn("[mem0] No API key found. Set MEM0_API_KEY or add apiKey to ~/.pi/agent/mem0-config.json. Extension disabled.");
    return;
  }
  const mem0 = new MemoryClient(metamemClientOptions({ apiKey: config.apiKey, host: metamemHost() }));
  bindMetamemClient(mem0);
  applySurfaceHeaders(mem0);
  const scopeCtx = {
    userId: resolveUserId(config.userId),
    appId: "",
    runId: "unknown"
  };
  function getScopeCtx() {
    return scopeCtx;
  }
  const telemetryCtx = { apiKey: config.apiKey };
  const lifecycle = createMemoryLifecycle();
  registerMemoryTool(pi, mem0, config, getScopeCtx, telemetryCtx);
  registerCommands(pi, mem0, config, getScopeCtx, telemetryCtx);
  setupAutoCapture(pi, mem0, config, getScopeCtx, telemetryCtx, lifecycle);
  captureEvent("pi.plugin.registered", {
    auto_capture: config.autoCapture,
    default_scope: config.defaultScope
  }, telemetryCtx);
  pi.on("session_start", async (_event, ctx) => {
    lifecycle.beginSession();
    scopeCtx.appId = detectAppId(ctx.cwd);
    const sessionFile = ctx.sessionManager?.getSessionFile?.();
    scopeCtx.runId = detectRunId(sessionFile);
    if (config.userId) {
      scopeCtx.userId = config.userId;
    }
    captureEvent("pi.session.start", {}, telemetryCtx);
  });
  pi.on("before_agent_start", async (event, _ctx) => {
    let extra = MEMORY_POLICY;
    const recall = await lifecycle.recall(
      event.prompt ?? "",
      config.contextInjection,
      (q) => mem0.search(q, { filters: resolveSearchFilters("project", scopeCtx) })
    );
    if (recall) extra += "\n\n" + recall;
    return {
      systemPrompt: (event.systemPrompt ?? "") + "\n\n" + extra
    };
  });
  pi.on("session_shutdown", async () => {
    captureEvent("pi.session.stop", {}, telemetryCtx);
  });
}

export {
  CONFIG_DIR,
  loadConfig,
  detectAppId,
  detectRunId,
  resolveSearchFilters,
  resolveAddParams,
  DEFAULT_CUSTOM_CATEGORIES,
  formatAge,
  formatMemoryCompact,
  formatMemoryList,
  groupByCategory,
  extractConversation,
  buildRecallContext,
  captureEvent,
  captureToolEvent,
  captureCommandEvent,
  _getEventQueue,
  _resetForTesting,
  buildToolExecute,
  registerMemoryTool,
  registerCommands,
  setupAutoCapture,
  MEMORY_POLICY,
  resolveUserId,
  mem0Extension
};
//# sourceMappingURL=chunk-35VXRJF7.js.map