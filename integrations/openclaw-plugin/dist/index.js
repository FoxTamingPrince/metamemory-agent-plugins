import { bindMetamemClient, metamemClientOptions, metamemAuthOrigin } from "./metamem-transport.js";
import {
  bootstrapTelemetryFlag,
  exists,
  mkdirp,
  readText,
  writeText
} from "./chunk-H3N55OII.js";

// index.ts
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

// providers.ts
function customCategoryMapToList(categories) {
  if (!categories || typeof categories !== "object") return void 0;
  const items = Object.entries(categories).map(([name, description]) => ({
    [name]: description
  }));
  return items.length ? items : void 0;
}
function normalizeMemoryItem(raw) {
  return {
    id: raw.id ?? raw.memory_id ?? "",
    memory: raw.memory ?? raw.text ?? raw.content ?? "",
    // Handle both platform (user_id, created_at) and OSS (userId, createdAt) field names
    user_id: raw.user_id ?? raw.userId,
    score: raw.score,
    categories: raw.categories,
    metadata: raw.metadata,
    created_at: raw.created_at ?? raw.createdAt,
    updated_at: raw.updated_at ?? raw.updatedAt
  };
}
function normalizeSearchResults(raw) {
  if (Array.isArray(raw)) return raw.map(normalizeMemoryItem);
  if (raw?.results && Array.isArray(raw.results))
    return raw.results.map(normalizeMemoryItem);
  return [];
}
function normalizeAddResult(raw) {
  if (raw?.results && Array.isArray(raw.results)) {
    return {
      results: raw.results.map((r) => ({
        id: r.id ?? r.memory_id ?? "",
        memory: r.memory ?? r.text ?? "",
        // Platform API may return PENDING status (async processing)
        // OSS stores event in metadata.event
        event: r.event ?? r.metadata?.event ?? (r.status === "PENDING" ? "ADD" : "ADD")
      }))
    };
  }
  if (Array.isArray(raw)) {
    return {
      results: raw.map((r) => ({
        id: r.id ?? r.memory_id ?? "",
        memory: r.memory ?? r.text ?? "",
        event: r.event ?? r.metadata?.event ?? (r.status === "PENDING" ? "ADD" : "ADD")
      }))
    };
  }
  return { results: [] };
}
var PlatformProvider = class {
  constructor(apiKey, baseUrl) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }
  apiKey;
  baseUrl;
  client;
  // MemoryClient from mem0ai
  initPromise = null;
  async ensureClient() {
    if (this.client) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._init().catch((err) => {
      this.initPromise = null;
      throw err;
    });
    return this.initPromise;
  }
  async _init() {
    const { default: MemoryClient } = await import("mem0ai");
    const opts = {
      apiKey: this.apiKey
    };
    if (this.baseUrl) opts.host = this.baseUrl;
    this.client = new MemoryClient(metamemClientOptions(opts));
  bindMetamemClient(this.client);
  }
  async add(messages, options) {
    await this.ensureClient();
    const opts = { userId: options.user_id };
    if (options.run_id) opts.runId = options.run_id;
    if (options.custom_instructions)
      opts.customInstructions = options.custom_instructions;
    if (options.custom_categories)
      opts.customCategories = options.custom_categories;
    if (options.source) opts.source = options.source;
    if (options.infer !== void 0) opts.infer = options.infer;
    if (options.deduced_memories)
      opts.deducedMemories = options.deduced_memories;
    if (options.metadata) opts.metadata = options.metadata;
    const result = await this.client.add(messages, opts);
    return normalizeAddResult(result);
  }
  async search(query, options) {
    await this.ensureClient();
    const opts = {};
    if (options.top_k != null) opts.topK = options.top_k;
    if (options.threshold != null) opts.threshold = options.threshold;
    if (options.categories != null) opts.categories = options.categories;
    const baseFilters = { user_id: options.user_id };
    if (options.run_id) baseFilters.run_id = options.run_id;
    if (options.filters) {
      opts.filters = { AND: [baseFilters, options.filters] };
    } else {
      opts.filters = baseFilters;
    }
    const results = await this.client.search(query, opts);
    return normalizeSearchResults(results);
  }
  async get(memoryId) {
    await this.ensureClient();
    const result = await this.client.get(memoryId);
    return normalizeMemoryItem(result);
  }
  async getAll(options) {
    await this.ensureClient();
    const filters = { user_id: options.user_id };
    if (options.run_id) filters.run_id = options.run_id;
    const opts = { filters };
    if (options.page_size != null) opts.pageSize = options.page_size;
    const results = await this.client.getAll(opts);
    if (Array.isArray(results)) return results.map(normalizeMemoryItem);
    if (results?.results && Array.isArray(results.results))
      return results.results.map(normalizeMemoryItem);
    return [];
  }
  async update(memoryId, text) {
    await this.ensureClient();
    await this.client.update(memoryId, { text });
  }
  async delete(memoryId) {
    await this.ensureClient();
    await this.client.delete(memoryId);
  }
  async deleteAll(userId) {
    await this.ensureClient();
    await this.client.deleteAll({ userId });
  }
  async history(memoryId) {
    await this.ensureClient();
    const result = await this.client.history(memoryId);
    return Array.isArray(result) ? result : [];
  }
};
var OSSProvider = class _OSSProvider {
  constructor(ossConfig, customInstructions, resolvePath) {
    this.ossConfig = ossConfig;
    this.customInstructions = customInstructions;
    this.resolvePath = resolvePath;
  }
  ossConfig;
  customInstructions;
  resolvePath;
  static _warnPatched = false;
  memory;
  // Memory from mem0ai/oss
  initPromise = null;
  async ensureMemory() {
    if (this.memory) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._init().catch((err) => {
      this.initPromise = null;
      throw err;
    });
    return this.initPromise;
  }
  _buildConfig(disableHistory = false) {
    const config = {};
    const defaultEmbedder = {
      provider: "openai",
      config: { model: "text-embedding-3-small" }
    };
    const defaultLlm = { provider: "openai", config: { model: "gpt-5-mini" } };
    const stripEmpty = (obj) => {
      const out = { ...obj };
      for (const k of Object.keys(out)) {
        if (out[k] === "") delete out[k];
      }
      return out;
    };
    if (this.ossConfig?.embedder) {
      const ec = stripEmpty(this.ossConfig.embedder.config ?? {});
      if (ec.host && !ec.url) {
        ec.url = ec.host;
        delete ec.host;
      }
      config.embedder = {
        provider: this.ossConfig.embedder.provider || defaultEmbedder.provider,
        config: { ...defaultEmbedder.config, ...ec }
      };
    } else {
      config.embedder = defaultEmbedder;
    }
    if (this.ossConfig?.llm) {
      const lc = stripEmpty(this.ossConfig.llm.config ?? {});
      if (lc.host && !lc.url) {
        lc.url = lc.host;
        delete lc.host;
      }
      config.llm = {
        provider: this.ossConfig.llm.provider || defaultLlm.provider,
        config: { ...defaultLlm.config, ...lc }
      };
    } else {
      config.llm = defaultLlm;
    }
    if (this.ossConfig?.vectorStore) {
      const vs = { ...this.ossConfig.vectorStore };
      const vsCfg = vs.config ?? {};
      const embedderDims = config.embedder?.config?.embeddingDims;
      if (!vsCfg.dimension && embedderDims) {
        vsCfg.dimension = embedderDims;
      }
      if (vsCfg.dimension && !vsCfg.embeddingModelDims) {
        vsCfg.embeddingModelDims = vsCfg.dimension;
      } else if (vsCfg.embeddingModelDims && !vsCfg.dimension) {
        vsCfg.dimension = vsCfg.embeddingModelDims;
      }
      vs.config = vsCfg;
      config.vectorStore = vs;
    }
    if (this.ossConfig?.historyDbPath) {
      const raw = this.ossConfig.historyDbPath;
      const isAbsolute = raw.startsWith("/") || /^[A-Za-z]:[/\\]/.test(raw);
      const dbPath = isAbsolute || !this.resolvePath ? raw : this.resolvePath(raw);
      config.historyDbPath = dbPath;
    }
    if (disableHistory || this.ossConfig?.disableHistory) {
      config.disableHistory = true;
    }
    if (this.customInstructions) config.customInstructions = this.customInstructions;
    return config;
  }
  async _init() {
    const mod = await import("mem0ai/oss");
    const Memory = mod.Memory;
    for (const cls of ["PGVector", "RedisDB", "Qdrant"]) {
      const VectorCls = mod[cls];
      if (!VectorCls || VectorCls.prototype.__patched) continue;
      const origInit = VectorCls.prototype.initialize;
      VectorCls.prototype.initialize = function() {
        if (!this.config?.embeddingModelDims && this.config?.dimension) {
          this.config.embeddingModelDims = this.config.dimension;
        }
        if (!this.dimension && this.config?.dimension) {
          this.dimension = this.config.dimension;
        }
        const dims = this.config?.embeddingModelDims ?? this.dimension;
        if (!dims) return Promise.resolve();
        if (!this._initializePromise) {
          this._initializePromise = origInit.call(this);
        }
        return this._initializePromise;
      };
      VectorCls.prototype.__patched = true;
    }
    let sqliteOk = true;
    if (!this.ossConfig?.disableHistory) {
      try {
        const bs3Mod = await import("better-sqlite3");
        const BS3 = bs3Mod.default ?? bs3Mod;
        const testDb = new BS3(":memory:");
        testDb.close();
      } catch {
        sqliteOk = false;
      }
    }
    if (!_OSSProvider._warnPatched) {
      const origWarn = console.warn;
      console.warn = (...args) => {
        if (typeof args[0] === "string" && args[0].includes("checkCompatibility")) return;
        origWarn.apply(console, args);
      };
      _OSSProvider._warnPatched = true;
    }
    let mem;
    try {
      mem = new Memory(this._buildConfig(!sqliteOk));
    } catch (err) {
      if (!this.ossConfig?.disableHistory && sqliteOk) {
        console.warn(
          "[mem0] Memory initialization failed, retrying with history disabled:",
          err instanceof Error ? err.message : err
        );
        mem = new Memory(this._buildConfig(true));
      } else {
        throw err;
      }
    }
    await mem.getAll({ filters: { user_id: "__mem0_warmup__" } });
    this.memory = mem;
  }
  async add(messages, options) {
    await this.ensureMemory();
    const addOpts = { userId: options.user_id };
    if (options.run_id) addOpts.runId = options.run_id;
    if (options.source) addOpts.source = options.source;
    if (options.infer !== void 0) addOpts.infer = options.infer;
    if (options.metadata) addOpts.metadata = options.metadata;
    let effectiveMessages = messages;
    if (options.infer === false && options.deduced_memories?.length) {
      effectiveMessages = options.deduced_memories.map((fact) => ({
        role: "user",
        content: fact
      }));
    }
    const result = await this.memory.add(effectiveMessages, addOpts);
    return normalizeAddResult(result);
  }
  async search(query, options) {
    await this.ensureMemory();
    const opts = {};
    if (options.top_k != null) opts.topK = options.top_k;
    if (options.threshold != null) opts.threshold = options.threshold;
    const baseFilters = { user_id: options.user_id };
    if (options.run_id) baseFilters.run_id = options.run_id;
    if (options.filters) {
      opts.filters = { AND: [baseFilters, options.filters] };
    } else {
      opts.filters = baseFilters;
    }
    const results = await this.memory.search(query, opts);
    const normalized = normalizeSearchResults(results);
    if (options.threshold != null) {
      return normalized.filter(
        (item) => (item.score ?? 0) >= options.threshold
      );
    }
    return normalized;
  }
  async get(memoryId) {
    await this.ensureMemory();
    const result = await this.memory.get(memoryId);
    return normalizeMemoryItem(result);
  }
  async getAll(options) {
    await this.ensureMemory();
    const filters = { user_id: options.user_id };
    if (options.run_id) filters.run_id = options.run_id;
    const getAllOpts = { filters };
    if (options.page_size != null) getAllOpts.topK = options.page_size;
    const results = await this.memory.getAll(getAllOpts);
    if (Array.isArray(results)) return results.map(normalizeMemoryItem);
    if (results?.results && Array.isArray(results.results))
      return results.results.map(normalizeMemoryItem);
    return [];
  }
  async update(memoryId, text) {
    await this.ensureMemory();
    await this.memory.update(memoryId, text);
  }
  async delete(memoryId) {
    await this.ensureMemory();
    await this.memory.delete(memoryId);
  }
  async deleteAll(userId) {
    await this.ensureMemory();
    await this.memory.deleteAll({ userId });
  }
  async history(memoryId) {
    await this.ensureMemory();
    try {
      const result = await this.memory.history(memoryId);
      return Array.isArray(result) ? result : [];
    } catch (err) {
      console.warn(
        "[mem0] OSS history() failed:",
        err instanceof Error ? err.message : err
      );
      return [];
    }
  }
};
function createProvider(cfg, api) {
  if (cfg.mode === "open-source") {
    return new OSSProvider(
      cfg.oss,
      cfg.customInstructions,
      (p) => api.resolvePath(p)
    );
  }
  return new PlatformProvider(cfg.apiKey, cfg.baseUrl);
}
function providerToBackend(provider, userId) {
  return {
    async add(content, messages, opts = {}) {
      const msgs = messages ?? (content ? [{ role: "user", content }] : []);
      const result = await provider.add(
        msgs,
        {
          user_id: opts.userId ?? userId,
          source: "OPENCLAW",
          ...opts.runId && { run_id: opts.runId },
          ...opts.metadata && { metadata: opts.metadata },
          ...opts.infer === false && { infer: false }
        }
      );
      return result;
    },
    async search(query, opts = {}) {
      const results = await provider.search(query, {
        user_id: opts.userId ?? userId,
        top_k: opts.topK,
        threshold: opts.threshold,
        filters: opts.filters,
        source: "OPENCLAW"
      });
      return results;
    },
    async get(memoryId) {
      const item = await provider.get(memoryId);
      return item;
    },
    async listMemories(opts = {}) {
      const items = await provider.getAll({
        user_id: opts.userId ?? userId,
        page_size: opts.pageSize,
        source: "OPENCLAW"
      });
      return items;
    },
    async update(memoryId, content, metadata) {
      if (content) await provider.update(memoryId, content);
      if (metadata) {
        console.warn(
          "providerToBackend: metadata updates are not supported in OSS mode, only text updates are applied"
        );
      }
      return { id: memoryId, updated: true };
    },
    async delete(memoryId, opts = {}) {
      if (opts.all) {
        await provider.deleteAll(opts.userId ?? userId);
        return { deleted: "all" };
      }
      if (memoryId) {
        await provider.delete(memoryId);
        return { deleted: memoryId };
      }
      throw new Error("Either memoryId or all is required");
    },
    async deleteEntities() {
      throw new Error("Entity management is only available in platform mode.");
    },
    async status() {
      return { connected: true, backend: "oss" };
    },
    async entities() {
      throw new Error("Entity management is only available in platform mode.");
    },
    async listEvents() {
      throw new Error("Event management is only available in platform mode.");
    },
    async getEvent() {
      throw new Error("Event management is only available in platform mode.");
    }
  };
}

// config.ts
import { userInfo } from "os";
var DEFAULT_CUSTOM_INSTRUCTIONS = `Your Task: Extract durable, actionable facts from conversations between a user and an AI assistant. Only store information that would be useful to an agent in a FUTURE session, days or weeks later.

Before storing any fact, ask: "Would a new agent \u2014 with no prior context \u2014 benefit from knowing this?" If the answer is no, do not store it.

Information to Extract (in priority order):

1. Configuration & System State Changes:
   - Tools/services configured, installed, or removed (with versions/dates)
   - Model assignments for agents, API keys configured (NEVER the key itself \u2014 see Exclude)
   - Cron schedules, automation pipelines, deployment configurations
   - Architecture decisions (agent hierarchy, system design, deployment strategy)
   - Specific identifiers: file paths, sheet IDs, channel IDs, user IDs, folder IDs

2. Standing Rules & Policies:
   - Explicit user directives about behavior ("never create accounts without consent")
   - Workflow policies ("each agent must review model selection before completing a task")
   - Security constraints, permission boundaries, access patterns

3. Identity & Demographics:
   - Name, location, timezone, language preferences
   - Occupation, employer, job role, industry

4. Preferences & Opinions:
   - Communication style preferences
   - Tool and technology preferences (with specifics: versions, configs)
   - Strong opinions or values explicitly stated
   - The WHY behind preferences when stated

5. Goals, Projects & Milestones:
   - Active projects (name, description, current status)
   - Completed setup milestones ("ElevenLabs fully configured as of 2026-02-20")
   - Deadlines, roadmaps, and progress tracking
   - Problems actively being solved

6. Technical Context:
   - Tech stack, tools, development environment
   - Agent ecosystem structure (names, roles, relationships)
   - Skill levels in different areas

7. Relationships & People:
   - Names and roles of people mentioned (colleagues, family, clients)
   - Team structure, key contacts

8. Decisions & Lessons:
   - Important decisions made and their reasoning
   - Lessons learned, strategies that worked or failed

Guidelines:

TEMPORAL ANCHORING (critical):
- ALWAYS include temporal context for time-sensitive facts using "As of YYYY-MM-DD, ..."
- Extract dates from message timestamps, dates mentioned in the text, or the system-provided current date
- If no date is available, note "date unknown" rather than omitting temporal context
- Examples: "As of 2026-02-20, ElevenLabs setup is complete" NOT "ElevenLabs setup is complete"

CONCISENESS:
- Use third person ("User prefers..." not "I prefer...")
- Keep related facts together in a single memory to preserve context
- "User's Tailscale machine 'mac' (IP 100.71.135.41) is configured under beau@rizedigital.io (as of 2026-02-20)"
- NOT a paragraph retelling the whole conversation

OUTCOMES OVER INTENT:
- When an assistant message summarizes completed work, extract the durable OUTCOMES
- "Call scripts sheet (ID: 146Qbb...) was updated with truth-based templates" NOT "User wants to update call scripts"
- Extract what WAS DONE, not what was requested

DEDUPLICATION:
- Before creating a new memory, check if a substantially similar fact already exists
- If so, UPDATE the existing memory with any new details rather than creating a duplicate

LANGUAGE:
- ALWAYS preserve the original language of the conversation
- If the user speaks Spanish, store the memory in Spanish; do not translate

Exclude (NEVER store):
- Passwords, API keys, tokens, secrets, or any credentials \u2014 even when embedded in configuration blocks, setup logs, or tool output. This includes strings starting with sk-, m0-, ak_, ghp_, bot tokens (digits followed by colon and alphanumeric string), bearer tokens, webhook URLs containing tokens, pairing codes, and any long alphanumeric strings that appear in config/env contexts. Never include the actual secret value in a memory. Instead, record that the credential was configured:
  WRONG: "User's API key is sk-abc123..." or "Bot token is 12345:AABcd..."
  RIGHT: "API key was configured for the service (as of YYYY-MM-DD)" or "Telegram bot token was set up"
- One-time commands or instructions ("stop the script", "continue where you left off")
- Acknowledgments or emotional reactions ("ok", "sounds good", "you're right", "sir")
- Transient UI/navigation states ("user is in the admin panel", "relay is attached")
- Ephemeral process status ("download at 50%", "daemon not running", "still syncing")
- Cron heartbeat outputs, NO_REPLY responses, compaction flush directives
- The current date/time as a standalone fact \u2014 timestamps are conversation context, not durable knowledge. "User indicates current time is 3:25 PM" is NEVER worth storing. However, DO use timestamps to anchor other facts: "User installed Ollama on 2026-03-21" is correct.
- System routing metadata (message IDs, sender IDs, channel routing info)
- Generic small talk with no informational content
- Raw code snippets (capture the intent/decision, not the code itself)
- Information the user explicitly asks not to remember`;
var DEFAULT_CUSTOM_CATEGORIES = {
  identity: "Personal identity information: name, age, location, timezone, occupation, employer, education, demographics",
  preferences: "Explicitly stated likes, dislikes, preferences, opinions, and values across any domain",
  goals: "Current and future goals, aspirations, objectives, targets the user is working toward",
  projects: "Specific projects, initiatives, or endeavors the user is working on, including status and details",
  technical: "Technical skills, tools, tech stack, development environment, programming languages, frameworks",
  decisions: "Important decisions made, reasoning behind choices, strategy changes, and their outcomes",
  relationships: "People mentioned by the user: colleagues, family, friends, their roles and relevance",
  routines: "Daily habits, work patterns, schedules, productivity routines, health and wellness habits",
  life_events: "Significant life events, milestones, transitions, upcoming plans and changes",
  lessons: "Lessons learned, insights gained, mistakes acknowledged, changed opinions or beliefs",
  work: "Work-related context: job responsibilities, workplace dynamics, career progression, professional challenges",
  health: "Health-related information voluntarily shared: conditions, medications, fitness, wellness goals"
};
var ALLOWED_KEYS = [
  "mode",
  "apiKey",
  "anonymousTelemetryId",
  "keyFingerprint",
  "baseUrl",
  "userId",
  "userEmail",
  "autoCapture",
  "autoRecall",
  "customInstructions",
  "customCategories",
  "customPrompt",
  "searchThreshold",
  "topK",
  "oss",
  "skills"
];
function assertAllowedKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length === 0) return;
  throw new Error(`${label} has unknown keys: ${unknown.join(", ")}`);
}
var mem0ConfigSchema = {
  parse(value, fileConfig) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("openclaw-mem0 config required");
    }
    const cfg = value;
    assertAllowedKeys(cfg, ALLOWED_KEYS, "openclaw-mem0 config");
    if (typeof cfg.mode === "string" && cfg.mode !== "platform" && cfg.mode !== "open-source") {
      console.warn(
        `[mem0] Unknown mode "${cfg.mode}" \u2014 expected "platform" or "open-source". Defaulting to "platform".`
      );
    }
    const mode = cfg.mode === "open-source" ? "open-source" : "platform";
    let resolvedApiKey = typeof cfg.apiKey === "string" ? cfg.apiKey : void 0;
    let resolvedBaseUrl = typeof cfg.baseUrl === "string" ? cfg.baseUrl : void 0;
    if (mode === "platform" && !resolvedApiKey && fileConfig) {
      if (fileConfig.apiKey) resolvedApiKey = fileConfig.apiKey;
      if (fileConfig.baseUrl) resolvedBaseUrl = fileConfig.baseUrl;
    }
    const needsSetup = mode === "platform" && !resolvedApiKey;
    let ossConfig;
    if (cfg.oss && typeof cfg.oss === "object" && !Array.isArray(cfg.oss)) {
      ossConfig = cfg.oss;
    }
    return {
      mode,
      apiKey: resolvedApiKey,
      anonymousTelemetryId: typeof cfg.anonymousTelemetryId === "string" ? cfg.anonymousTelemetryId : void 0,
      baseUrl: resolvedBaseUrl,
      userId: typeof cfg.userId === "string" && cfg.userId ? cfg.userId : (() => {
        try {
          return userInfo().username || "default";
        } catch {
          return "default";
        }
      })(),
      autoCapture: cfg.autoCapture !== false,
      autoRecall: cfg.autoRecall !== false,
      // v3.0.0: customPrompt renamed to customInstructions (backwards-compat: accept either)
      customInstructions: typeof cfg.customInstructions === "string" ? cfg.customInstructions : typeof cfg.customPrompt === "string" ? cfg.customPrompt : DEFAULT_CUSTOM_INSTRUCTIONS,
      customCategories: cfg.customCategories && typeof cfg.customCategories === "object" && !Array.isArray(cfg.customCategories) ? cfg.customCategories : DEFAULT_CUSTOM_CATEGORIES,
      searchThreshold: typeof cfg.searchThreshold === "number" ? cfg.searchThreshold : 0.1,
      topK: typeof cfg.topK === "number" ? cfg.topK : 5,
      needsSetup,
      oss: ossConfig,
      skills: cfg.skills && typeof cfg.skills === "object" && !Array.isArray(cfg.skills) ? cfg.skills : void 0
    };
  }
};

// public-artifacts.ts
function createPublicArtifactsProvider(ctx) {
  return {
    async listArtifacts(options) {
      const artifacts = [];
      const userId = options?.userId ?? ctx.effectiveUserId();
      const types = options?.types ?? ["memory", "entity"];
      const limit = options?.limit ?? 100;
      try {
        if (types.includes("memory")) {
          const memories = await ctx.provider.getAll({
            user_id: userId,
            page_size: limit
          });
          for (const mem of memories) {
            artifacts.push(memoryToArtifact(mem));
          }
        }
        if (types.includes("entity")) {
          const entityArtifacts = extractEntityArtifacts(artifacts.filter((a) => a.type === "memory"));
          artifacts.push(...entityArtifacts);
        }
      } catch (err) {
        console.warn(
          "[mem0] publicArtifacts.listArtifacts failed:",
          err instanceof Error ? err.message : err
        );
      }
      return artifacts.slice(0, limit);
    }
  };
}
function memoryToArtifact(mem) {
  return {
    id: `mem0:memory:${mem.id}`,
    type: "memory",
    title: mem.memory.slice(0, 80) + (mem.memory.length > 80 ? "..." : ""),
    content: mem.memory,
    metadata: {
      score: mem.score,
      categories: mem.categories,
      user_id: mem.user_id,
      ...mem.metadata
    },
    createdAt: mem.created_at,
    updatedAt: mem.updated_at
  };
}
function extractEntityArtifacts(memoryArtifacts) {
  const byCategory = /* @__PURE__ */ new Map();
  for (const artifact of memoryArtifacts) {
    const categories = artifact.metadata?.categories ?? ["uncategorized"];
    for (const cat of categories) {
      const existing = byCategory.get(cat) ?? [];
      existing.push(artifact);
      byCategory.set(cat, existing);
    }
  }
  const entities = [];
  for (const [category, mems] of byCategory) {
    if (mems.length >= 2) {
      entities.push({
        id: `mem0:entity:${category}`,
        type: "entity",
        title: `${category.charAt(0).toUpperCase() + category.slice(1)} (${mems.length} memories)`,
        content: mems.map((m) => `- ${m.content}`).join("\n"),
        metadata: {
          category,
          memoryCount: mems.length,
          memoryIds: mems.map((m) => m.id)
        }
      });
    }
  }
  return entities;
}

// filtering.ts
var NOISE_MESSAGE_PATTERNS = [
  /^(HEARTBEAT_OK|NO_REPLY)$/i,
  /^Current time:.*\d{4}/,
  /^Pre-compaction memory flush/i,
  /^(ok|yes|no|sir|sure|thanks|done|good|nice|cool|got it|it's on|continue|alright|okay|yep|nope|uh-huh|mm-hmm|hmm)$/i,
  /^System: \[.*\] (Slack message edited|Gateway restart|Exec (failed|completed))/,
  /^System: \[.*\] ⚠️ Post-Compaction Audit:/,
  // JSON-only messages (tool results, metadata)
  /^[\s]*\{[\s\S]*\}[\s]*$/,
  /^[\s]*\[[\s\S]*\][\s]*$/,
  // Empty or whitespace-only after trimming
  /^[\s\n\r]*$/,
  // Technical noise patterns
  /^(Error|Warning|Info|Debug):/i,
  /^(Loading|Loaded|Fetching|Fetched|Processing|Processed)\b/i,
  /^\[[\d:T\-\.Z]+\]/,
  // Timestamps like [2024-01-01T12:00:00.000Z]
  /^(SUCCESS|FAILURE|PENDING|COMPLETED|FAILED)$/i,
  // Tool/function call noise
  /^(Calling|Called|Invoking|Invoked|Executing|Executed)\s+(function|tool|method)/i,
  /^Tool (call|result|output):/i,
  // Single emoji or very short messages
  /^[\p{Emoji}\s]{1,5}$/u
];
var SESSION_SPECIFIC_PATTERNS = [
  // Tool availability discussions
  /tools?\s+(are|is)\s+(not\s+)?(exposed|available|accessible)/i,
  /plugin\s+(does not|doesn't)\s+expose/i,
  /I\s+(do not|don't)\s+(currently\s+)?see\s+.*tools?\s+exposed/i,
  /memory_(search|get|add|update|delete|list)\s+(tool|is|are)/i,
  // Session-specific capability statements
  /in\s+this\s+session/i,
  /my\s+(live\s+)?callable\s+tool\s+registry/i,
  /tools?\s+I\s+(have|currently have)\s+access\s+to/i,
  // Plugin/capability status statements
  /openclaw-mem0\s+plugin/i,
  /memory\s+wiki.*capability/i,
  /workspace\s+memory\s+files/i
];
var NOISE_CONTENT_PATTERNS = [
  {
    pattern: /Conversation info \(untrusted metadata\):\s*```json\s*\{[\s\S]*?\}\s*```/g,
    replacement: ""
  },
  {
    // OpenClaw TUI sends "Sender (untrusted metadata)" with a JSON block
    // containing label, id, name, username — strip to prevent storing as memory
    pattern: /Sender\s*\(untrusted metadata\):\s*```json[\s\S]*?```\s*/gi,
    replacement: ""
  },
  { pattern: /\[media attached:.*?\]/g, replacement: "" },
  {
    pattern: /To send an image back, prefer the message tool[\s\S]*?Keep caption in the text body\./g,
    replacement: ""
  },
  {
    pattern: /System: \[\d{4}-\d{2}-\d{2}.*?\] ⚠️ Post-Compaction Audit:[\s\S]*?after memory compaction\./g,
    replacement: ""
  },
  {
    pattern: /Replied message \(untrusted, for context\):\s*```json[\s\S]*?```/g,
    replacement: ""
  },
  // Strip embedded JSON blocks that might contain metadata
  {
    pattern: /```json\s*\{[\s\S]*?\}\s*```/g,
    replacement: ""
  },
  // Strip code blocks that are just tool outputs
  {
    pattern: /```(?:text|output|result|log)\s*[\s\S]*?```/gi,
    replacement: ""
  },
  // Strip inline tool call IDs
  {
    pattern: /\[tool_call_id:[^\]]+\]/g,
    replacement: ""
  },
  // Strip memory IDs from responses
  {
    pattern: /\(id:\s*[a-f0-9-]+\)/gi,
    replacement: ""
  },
  // Strip session/run IDs
  {
    pattern: /(?:session|run|agent)[_-]?(?:id|key)?:\s*[a-zA-Z0-9_:-]+/gi,
    replacement: ""
  }
];
var GENERIC_ASSISTANT_PATTERNS = [
  /^(I see you'?ve shared|Thanks for sharing|Got it[.!]?\s*(I see|Let me|How can)|I understand[.!]?\s*(How can|Is there|Would you))/i,
  /^(How can I help|Is there anything|Would you like me to|Let me know (if|how|what))/i,
  /^(I('?ll| will) (help|assist|look into|review|take a look))/i,
  /^(Sure[.!]?\s*(How|What|Is)|Understood[.!]?\s*(How|What|Is))/i,
  /^(That('?s| is) (noted|understood|clear))/i
];
function isNoiseMessage(content) {
  const trimmed = content.trim();
  if (!trimmed) return true;
  return NOISE_MESSAGE_PATTERNS.some((p) => p.test(trimmed));
}
function isSessionSpecificContent(content) {
  const trimmed = content.trim();
  if (!trimmed) return false;
  const matches = SESSION_SPECIFIC_PATTERNS.filter((p) => p.test(trimmed));
  return matches.length >= 2;
}
function isGenericAssistantMessage(content) {
  const trimmed = content.trim();
  if (trimmed.length > 300) return false;
  return GENERIC_ASSISTANT_PATTERNS.some((p) => p.test(trimmed));
}
function stripNoiseFromContent(content) {
  let cleaned = content;
  for (const { pattern, replacement } of NOISE_CONTENT_PATTERNS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned;
}
function filterMessagesForExtraction(messages) {
  const filtered = [];
  for (const msg of messages) {
    if (isNoiseMessage(msg.content)) continue;
    if (msg.role === "assistant" && isGenericAssistantMessage(msg.content))
      continue;
    if (isSessionSpecificContent(msg.content)) continue;
    const cleaned = stripNoiseFromContent(msg.content);
    if (!cleaned) continue;
    filtered.push({ role: msg.role, content: cleaned });
  }
  return filtered;
}

// isolation.ts
var SKIP_TRIGGERS = /* @__PURE__ */ new Set(["cron", "heartbeat", "automation", "schedule"]);
function isNonInteractiveTrigger(trigger, sessionKey) {
  if (trigger && SKIP_TRIGGERS.has(trigger.toLowerCase())) return true;
  if (sessionKey) {
    if (/:cron:/i.test(sessionKey) || /:heartbeat:/i.test(sessionKey))
      return true;
  }
  return false;
}
function isSubagentSession(sessionKey) {
  if (!sessionKey) return false;
  return /:subagent:/i.test(sessionKey);
}
function extractAgentId(sessionKey) {
  if (!sessionKey) return void 0;
  const subagentMatch = sessionKey.match(/:subagent:([^:]+)$/);
  if (subagentMatch?.[1]) return `subagent-${subagentMatch[1]}`;
  const match = sessionKey.match(/^agent:([^:]+):/);
  const agentId = match?.[1];
  if (!agentId || agentId === "main") return void 0;
  return agentId;
}
function effectiveUserId(baseUserId, sessionKey) {
  const agentId = extractAgentId(sessionKey);
  return agentId ? `${baseUserId}:agent:${agentId}` : baseUserId;
}
function agentUserId(baseUserId, agentId) {
  return `${baseUserId}:agent:${agentId}`;
}
function resolveUserId(baseUserId, opts, currentSessionId) {
  if (opts.agentId) return agentUserId(baseUserId, opts.agentId);
  if (opts.userId) return opts.userId;
  return effectiveUserId(baseUserId, currentSessionId);
}

// skill-loader.ts
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
var DEFAULT_CATEGORIES = {
  configuration: { importance: 0.95, ttl: null },
  rule: { importance: 0.9, ttl: null },
  identity: { importance: 0.95, ttl: null, immutable: true },
  preference: { importance: 0.85, ttl: null },
  decision: { importance: 0.8, ttl: null },
  technical: { importance: 0.8, ttl: null },
  relationship: { importance: 0.75, ttl: null },
  project: { importance: 0.75, ttl: "90d" },
  operational: { importance: 0.6, ttl: "7d" }
};
var DEFAULT_CREDENTIAL_PATTERNS = [
  "sk-",
  "m0-",
  "ghp_",
  "AKIA",
  "ak_",
  "Bearer ",
  "bot\\d+:AA",
  "password=",
  "token=",
  "secret="
];
function parseSkillFile(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    return {
      frontmatter: { name: "unknown" },
      body: content
    };
  }
  const fmBlock = fmMatch[1];
  const body = fmMatch[2].trim();
  const fm = {};
  for (const line of fmBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (value === "false") value = false;
    else if (value === "true") value = true;
    fm[key] = value;
  }
  return {
    frontmatter: fm,
    body
  };
}
function normalizeModuleUrlToPath(moduleUrl) {
  const normalizedUrl = moduleUrl.startsWith("file:") ? moduleUrl : pathToFileURL(moduleUrl).toString();
  return fileURLToPath(normalizedUrl);
}
function resolveSkillsDir() {
  const candidates = [];
  try {
    const metaDir = path.dirname(normalizeModuleUrlToPath(import.meta.url));
    candidates.push(path.join(metaDir, "skills"));
    candidates.push(path.join(metaDir, "..", "skills"));
  } catch {
  }
  if (typeof __dirname !== "undefined") {
    candidates.push(path.join(__dirname, "skills"));
    candidates.push(path.join(__dirname, "..", "skills"));
  }
  for (const dir of candidates) {
    if (exists(path.join(dir, "memory-triage", "SKILL.md"))) {
      return dir;
    }
  }
  return candidates[0] ?? "skills";
}
var SKILLS_DIR = resolveSkillsDir();
var RESOLVED_SKILLS_DIR = path.resolve(SKILLS_DIR);
function safePath(...segments) {
  const resolved = path.resolve(SKILLS_DIR, ...segments);
  if (resolved !== RESOLVED_SKILLS_DIR && !resolved.startsWith(RESOLVED_SKILLS_DIR + path.sep)) {
    return null;
  }
  return resolved;
}
function readSkillFile(skillName) {
  const filePath = safePath(skillName, "SKILL.md");
  if (!filePath) return null;
  try {
    return readText(filePath);
  } catch {
    return null;
  }
}
function readDomainOverlay(domain, targetSkill) {
  const filePath = safePath(targetSkill, "domains", `${domain}.md`);
  if (!filePath) return null;
  try {
    const content = readText(filePath);
    const parsed = parseSkillFile(content);
    const appliesTo = parsed.frontmatter.applies_to;
    if (appliesTo && appliesTo !== targetSkill) {
      return null;
    }
    return parsed.body;
  } catch {
    return null;
  }
}
function renderCategoriesBlock(categories) {
  const lines = [
    "\n## Active Category Configuration (overrides defaults above)\n"
  ];
  for (const [name, cat] of Object.entries(categories)) {
    const ttlLabel = cat.ttl ? `expires: ${cat.ttl}` : "permanent";
    const immLabel = cat.immutable ? ", immutable" : "";
    lines.push(
      `- **${name.toUpperCase()}** (importance: ${cat.importance} | ${ttlLabel}${immLabel})`
    );
  }
  return lines.join("\n");
}
function renderTriageKnobs(config, options = {}) {
  const lines = [];
  const includeCredentialPatterns = options.includeCredentialPatterns ?? true;
  const includeDefaultCredentialPatterns = options.includeDefaultCredentialPatterns ?? true;
  if (config.triage?.importanceThreshold !== void 0) {
    lines.push(
      `- Only store facts with importance >= ${config.triage.importanceThreshold}`
    );
  }
  const hasCustomCredentialPatterns = config.triage?.credentialPatterns !== void 0;
  if (includeCredentialPatterns && (includeDefaultCredentialPatterns || hasCustomCredentialPatterns)) {
    const patterns = resolveCredentialPatterns(config);
    lines.push(`- Credential patterns to scan: ${patterns.map((p) => `\`${p}\``).join(", ")}`);
  }
  if (lines.length === 0) return "";
  return "\n## Active Configuration Overrides\n\n" + lines.join("\n");
}
var COMPACT_CUSTOM_RULE_CHAR_BUDGET = 280;
var COMPACT_CUSTOM_RULE_PREVIEW_LIMIT = 2;
function formatCategoryConfig(name, cat) {
  const ttlLabel = cat.ttl ? `expires: ${cat.ttl}` : "permanent";
  const immLabel = cat.immutable ? ", immutable" : "";
  return `${name} (importance ${cat.importance}, ${ttlLabel}${immLabel})`;
}
function renderCompactCategories(config) {
  if (!config.categories || Object.keys(config.categories).length === 0) {
    return [];
  }
  const mergedCategories = resolveCategories(config);
  return [
    "## Active Category Overrides",
    "",
    ...Object.entries(config.categories).map(
      ([name]) => `- ${formatCategoryConfig(name, mergedCategories[name])}`
    )
  ];
}
function renderCompactCustomRules(config) {
  const includeRules = config.customRules?.include ?? [];
  const excludeRules = config.customRules?.exclude ?? [];
  if (includeRules.length === 0 && excludeRules.length === 0) {
    return [];
  }
  const formatRuleList = (label, rules) => `${label}: ${rules.map((rule) => `"${rule}"`).join("; ")}`;
  const lines = [];
  if (includeRules.length > 0) {
    lines.push(formatRuleList("Include", includeRules));
  }
  if (excludeRules.length > 0) {
    lines.push(formatRuleList("Exclude", excludeRules));
  }
  const combined = lines.join(" ");
  if (combined.length <= COMPACT_CUSTOM_RULE_CHAR_BUDGET) {
    return ["## Active Custom Rules", "", ...lines.map((line) => `- ${line}`)];
  }
  const preview = [
    ...includeRules.slice(0, COMPACT_CUSTOM_RULE_PREVIEW_LIMIT).map((rule) => `include "${rule}"`),
    ...excludeRules.slice(0, COMPACT_CUSTOM_RULE_PREVIEW_LIMIT).map((rule) => `exclude "${rule}"`)
  ];
  return [
    "## Active Custom Rules",
    "",
    `- ${includeRules.length} include rule(s) and ${excludeRules.length} exclude rule(s) are configured.`,
    `- Prompt kept compact, full rule text omitted because it exceeded ${COMPACT_CUSTOM_RULE_CHAR_BUDGET} characters.`,
    ...preview.length > 0 ? [`- Preview: ${preview.join("; ")}`] : []
  ];
}
function loadSkill(skillName, config = {}) {
  const raw = readSkillFile(skillName);
  if (!raw) return null;
  const parsed = parseSkillFile(raw);
  const parts = [parsed.body];
  if (config.domain) {
    const overlay = readDomainOverlay(config.domain, skillName);
    if (overlay) {
      parts.push("\n" + overlay);
    }
  }
  if (skillName === "memory-triage" && config.categories) {
    const mergedCats = resolveCategories(config);
    parts.push(renderCategoriesBlock(mergedCats));
  }
  if (skillName === "memory-triage") {
    const knobs = renderTriageKnobs(config);
    if (knobs) parts.push(knobs);
  }
  if (skillName === "memory-triage" && config.customRules) {
    const rulesBlock = ["\n## User Custom Rules\n"];
    if (config.customRules.include?.length) {
      rulesBlock.push("Additionally extract:");
      for (const rule of config.customRules.include) {
        rulesBlock.push(`- ${rule}`);
      }
    }
    if (config.customRules.exclude?.length) {
      rulesBlock.push("\nAdditionally skip:");
      for (const rule of config.customRules.exclude) {
        rulesBlock.push(`- ${rule}`);
      }
    }
    parts.push(rulesBlock.join("\n"));
  }
  return {
    name: skillName,
    prompt: parts.join("\n"),
    frontmatter: parsed.frontmatter
  };
}
function loadTriagePrompt(config = {}) {
  const triage = loadSkill("memory-triage", config);
  if (triage) {
    const parts2 = [];
    parts2.push("<memory-system>");
    parts2.push(
      "IMPORTANT: Use `memory_add` tool for ALL user facts. NEVER write user info to workspace files (USER.md, memory/)."
    );
    parts2.push("");
    parts2.push(triage.prompt);
    parts2.push("");
    parts2.push("## Tool Usage");
    parts2.push("");
    parts2.push(
      "Batch facts by CATEGORY. All facts in one memory_add call must share the same category because category determines retention policy (TTL, immutability). If a turn has facts in different categories, make one call per category."
    );
    parts2.push("");
    parts2.push("FORMAT (single category):");
    parts2.push(
      '  memory_add(facts: ["User is Alex, backend engineer at Stripe, PST timezone"], category: "identity")'
    );
    parts2.push("FORMAT (mixed categories in one turn, separate calls):");
    parts2.push(
      '  memory_add(facts: ["User is Alex, backend engineer at Stripe, PST timezone"], category: "identity")'
    );
    parts2.push(
      '  memory_add(facts: ["As of 2026-04-01, migrating from Postgres to CockroachDB"], category: "decision")'
    );
    if (config.recall?.enabled !== false) {
      const strategy = config.recall?.strategy ?? "smart";
      parts2.push("");
      parts2.push("## Searching Memory");
      parts2.push("");
      if (strategy === "manual") {
        parts2.push(
          "You control all memory search. No automatic recall happens. Use memory_search proactively:"
        );
        parts2.push(
          "- At the start of a new conversation, search for user identity and context."
        );
        parts2.push(
          "- When the user references something you do not have context for."
        );
        parts2.push("- When the conversation topic shifts to a new domain.");
        parts2.push(
          "- Before updating a memory, search to find the existing version."
        );
        parts2.push("");
      } else if (strategy === "always") {
        parts2.push(
          "Automatic recall runs for both long-term and session memory. Use manual searches only when you need more specific context."
        );
        parts2.push("");
      }
      parts2.push(
        "When calling memory_search, ALWAYS rewrite the query. NEVER pass the user's raw message."
      );
      parts2.push(
        "Stored memories are third-person factual statements. Write a query that matches storage language, not conversation language."
      );
      parts2.push(
        "Process: (1) Name your target. (2) Extract signal: proper nouns, technical terms, domain concepts. (3) Bridge to storage language: add terms the stored memory contains (user, decided, prefers, rule, configured, based in). (4) Compose 3-6 keywords."
      );
      parts2.push(
        'WRONG: memory_search("Who was that nutritionist my wife recommended?")'
      );
      parts2.push(
        'RIGHT: memory_search("nutritionist wife recommended relationship")'
      );
      parts2.push('WRONG: memory_search("What timezone am I in?")');
      parts2.push('RIGHT: memory_search("user timezone location based")');
      parts2.push("");
      parts2.push(
        "ENTITY SCOPING: Memories are scoped by user_id, agent_id, and run_id. You do not need to pass these in most cases. The plugin handles scoping automatically based on the current session."
      );
      parts2.push(
        "- Default behavior: all memory operations use the configured userId and current session. You do not need to pass userId or agentId."
      );
      parts2.push(
        "- Use agentId only when you need to read or write memories for a DIFFERENT agent (e.g., querying what the 'researcher' agent knows). This accesses a separate namespace."
      );
      parts2.push(
        "- Use userId only when explicitly instructed to operate on a different user's memories."
      );
      parts2.push(
        "- Do not pass run_id directly. The plugin manages session scoping through the scope parameter."
      );
      parts2.push(
        "- In multi-agent setups, each agent has isolated memory. The main agent's memories are separate from subagent memories."
      );
      parts2.push("");
      parts2.push("SEARCH SCOPE: Choose the right scope for each search:");
      parts2.push(
        '- scope: "long-term" for user context, identity, preferences, decisions (default, most common)'
      );
      parts2.push('- scope: "session" for facts from this conversation only');
      parts2.push(
        '- scope: "all" only when you truly need both scopes combined'
      );
      parts2.push("Using a specific scope avoids unnecessary backend fan-out.");
      parts2.push("");
      parts2.push(
        "SEARCH FILTERS: When the user's intent implies a time range or category constraint, pass a `filters` object alongside your rewritten query."
      );
      parts2.push(
        '- Time: "last week" -> filters: {"created_at": {"gte": "2026-03-24"}}'
      );
      parts2.push('- Category: "my preferences" -> categories: ["preference"]');
      parts2.push(
        "- Available operators: eq, ne, gt, gte, lt, lte, in, contains. Logical: AND, OR, NOT."
      );
    }
    parts2.push("</memory-system>");
    return parts2.join("\n");
  }
  const parts = [];
  parts.push("<memory-system>");
  parts.push(
    "You have persistent long-term memory via mem0. After EVERY response, evaluate the turn for facts worth storing."
  );
  parts.push(
    "Use `memory_add` tool for ALL user facts. NEVER write user info to workspace files (USER.md, memory/)."
  );
  parts.push("Most turns produce ZERO memory operations. That is correct.");
  parts.push(
    "Only store facts a new agent would need days later: identity, preferences, decisions, rules, projects, configs."
  );
  parts.push(
    "Batch facts by CATEGORY. All facts in one call must share the same category."
  );
  parts.push(
    'Format: memory_add(facts: ["fact text"], category: "identity")'
  );
  parts.push(
    "NEVER store credentials (sk-, m0-, ghp_, AKIA, Bearer tokens, passwords)."
  );
  if (config.recall?.enabled !== false) {
    parts.push(
      "When searching, rewrite queries for retrieval. Do not pass raw user messages."
    );
  }
  parts.push("</memory-system>");
  return parts.join("\n");
}
function loadCompactTriagePrompt(config = {}) {
  if (!readSkillFile("memory-triage")) {
    return loadTriagePrompt(config);
  }
  const parts = [];
  parts.push("<memory-system>");
  parts.push(
    "IMPORTANT: Use `memory_add` tool for ALL user facts. NEVER write user info to workspace files (USER.md, memory/)."
  );
  parts.push(
    "After every response, evaluate whether a new agent would benefit from remembering this days later. Most turns should produce zero memory operations."
  );
  parts.push(
    "Only store durable, self-contained, third-person facts: identity, preferences with rationale, standing rules, decisions, projects, configurations, technical context, and relationships."
  );
  parts.push(
    "Never store credentials, tokens, webhook secrets, or raw tool output. If a secret was configured, store only that the credential was configured."
  );
  parts.push(
    "When a recalled fact materially changes, search for the existing memory and update it in place. Skip cosmetic rewording."
  );
  parts.push("");
  parts.push("## Tool Usage");
  parts.push("");
  parts.push(
    "Batch facts by CATEGORY. All facts in one memory_add call must share the same category because category determines retention policy (TTL, immutability). If a turn has facts in different categories, make one call per category."
  );
  parts.push(
    'Format: memory_add(facts: ["User is Alex, backend engineer at Stripe, PST timezone"], category: "identity")'
  );
  parts.push(
    'Mixed categories: memory_add(..., category: "identity") and memory_add(..., category: "decision") in separate calls.'
  );
  parts.push(
    "Categories: identity, configuration, rule, preference, decision, technical, relationship, project."
  );
  const categoryLines = renderCompactCategories(config);
  if (categoryLines.length > 0) {
    parts.push("");
    parts.push(...categoryLines);
  }
  const knobLines = renderTriageKnobs(config, {
    includeDefaultCredentialPatterns: false
  }).split("\n").filter(Boolean);
  if (knobLines.length > 0) {
    parts.push("");
    parts.push(...knobLines);
  }
  const customRuleLines = renderCompactCustomRules(config);
  if (customRuleLines.length > 0) {
    parts.push("");
    parts.push(...customRuleLines);
  }
  if (config.recall?.enabled !== false) {
    const strategy = config.recall?.strategy ?? "smart";
    parts.push("");
    parts.push("## Searching Memory");
    parts.push("");
    if (strategy === "manual") {
      parts.push(
        "No automatic recall happens in manual mode. Use memory_search proactively at conversation start, when context is missing, when topics shift, and before updating a memory."
      );
    } else if (strategy === "always") {
      parts.push(
        "Automatic recall runs for both long-term and session memory. Use manual searches only when you need more specific context."
      );
    } else {
      parts.push(
        "Automatic recall runs for long-term memory. Use manual searches when the injected context is not enough."
      );
    }
    parts.push(
      "When calling memory_search, ALWAYS rewrite the query. NEVER pass the user's raw message."
    );
    parts.push(
      "Convert the request into 3-6 factual keywords that match stored memory language: user, decided, prefers, rule, configured, based in, plus the concrete nouns and names from the request."
    );
    parts.push(
      'WRONG: memory_search("Who was that nutritionist my wife recommended?")'
    );
    parts.push(
      'RIGHT: memory_search("nutritionist wife recommended relationship")'
    );
    parts.push('WRONG: memory_search("What timezone am I in?")');
    parts.push('RIGHT: memory_search("user timezone location based")');
    parts.push(
      'Scope: use "long-term" for durable user context, "session" for this conversation, and "all" only when you truly need both.'
    );
    parts.push(
      "When the request implies a time range or category, add filters or categories instead of broadening the query text."
    );
  }
  parts.push("</memory-system>");
  return parts.join("\n");
}
function resolveCategories(config = {}) {
  return { ...DEFAULT_CATEGORIES, ...config.categories || {} };
}
function resolveCredentialPatterns(config = {}) {
  return config.triage?.credentialPatterns ?? DEFAULT_CREDENTIAL_PATTERNS;
}
function isSkillsMode(config) {
  if (!config) return false;
  return config.triage?.enabled !== false;
}

// recall.ts
var DEFAULT_TOKEN_BUDGET = 1500;
var DEFAULT_MAX_MEMORIES = 15;
var DEFAULT_THRESHOLD = 0.4;
var DEFAULT_CATEGORY_ORDER = [
  "identity",
  "configuration",
  "rule",
  "preference",
  "decision",
  "technical",
  "relationship",
  "project",
  "operational"
];
var CHARS_PER_TOKEN = 4;
function getMemoryCategory(memory) {
  if (memory.metadata?.category && typeof memory.metadata.category === "string") {
    return memory.metadata.category;
  }
  if (memory.categories?.length) {
    return memory.categories[0];
  }
  return "uncategorized";
}
function getMemoryImportance(memory) {
  if (memory.metadata?.importance && typeof memory.metadata.importance === "number") {
    return memory.metadata.importance;
  }
  const cat = getMemoryCategory(memory);
  const defaults = {
    identity: 0.95,
    configuration: 0.95,
    rule: 0.9,
    preference: 0.85,
    decision: 0.8,
    technical: 0.8,
    relationship: 0.75,
    project: 0.75,
    operational: 0.6
  };
  return defaults[cat] ?? 0.5;
}
function estimateTokens(text) {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
function rankMemories(memories, categoryOrder) {
  const orderMap = new Map(categoryOrder.map((cat, i) => [cat, i]));
  return [...memories].sort((a, b) => {
    const catA = getMemoryCategory(a);
    const catB = getMemoryCategory(b);
    const orderA = orderMap.get(catA) ?? 999;
    const orderB = orderMap.get(catB) ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    const impA = getMemoryImportance(a);
    const impB = getMemoryImportance(b);
    if (impA !== impB) return impB - impA;
    return (b.score ?? 0) - (a.score ?? 0);
  });
}
function budgetMemories(rankedMemories, tokenBudget, maxMemories, identityAlwaysInclude) {
  const selected = [];
  let usedTokens = 0;
  for (const memory of rankedMemories) {
    if (selected.length >= maxMemories) break;
    const memTokens = estimateTokens(memory.memory);
    const isIdentity = getMemoryCategory(memory) === "identity" || getMemoryCategory(memory) === "configuration";
    if (identityAlwaysInclude && isIdentity) {
      selected.push(memory);
      usedTokens += memTokens;
      continue;
    }
    if (usedTokens + memTokens > tokenBudget) continue;
    selected.push(memory);
    usedTokens += memTokens;
  }
  return selected;
}
function formatRecalledMemories(memories, userId) {
  if (memories.length === 0) {
    return `<recalled-memories>
No stored memories found for "${userId}".
</recalled-memories>`;
  }
  const grouped = /* @__PURE__ */ new Map();
  for (const mem of memories) {
    const cat = getMemoryCategory(mem);
    const existing = grouped.get(cat) || [];
    existing.push(mem);
    grouped.set(cat, existing);
  }
  const lines = [
    `<recalled-memories>`,
    `Stored memories for "${userId}" (${memories.length} total, ranked by importance):`,
    ""
  ];
  for (const [category, mems] of grouped.entries()) {
    const label = category.charAt(0).toUpperCase() + category.slice(1);
    lines.push(`${label}:`);
    for (const mem of mems) {
      const imp = getMemoryImportance(mem);
      const cats = mem.categories?.length ? ` [${mem.categories.join(", ")}]` : "";
      lines.push(`- ${mem.memory}${cats} (${Math.round(imp * 100)}%)`);
    }
    lines.push("");
  }
  lines.push("</recalled-memories>");
  return lines.join("\n");
}
function sanitizeQuery(raw) {
  let cleaned = raw.replace(
    /Sender\s*\(untrusted metadata\):\s*```json[\s\S]*?```\s*/gi,
    ""
  );
  cleaned = cleaned.replace(/^\[.*?\]\s*/g, "");
  cleaned = cleaned.trim();
  return cleaned || raw;
}
async function recall(provider, query, userId, config = {}, sessionId) {
  const recallConfig = config.recall ?? {};
  const tokenBudget = recallConfig.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const maxMemories = recallConfig.maxMemories ?? DEFAULT_MAX_MEMORIES;
  const threshold = recallConfig.threshold ?? DEFAULT_THRESHOLD;
  const categoryOrder = recallConfig.categoryOrder ?? DEFAULT_CATEGORY_ORDER;
  const identityAlwaysInclude = recallConfig.identityAlwaysInclude !== false;
  const searchOpts = {
    user_id: userId,
    top_k: maxMemories * 2,
    // Over-fetch for ranking
    threshold,
    source: "OPENCLAW"
  };
  const cleanQuery = sanitizeQuery(query);
  let longTermMemories = [];
  try {
    longTermMemories = await provider.search(cleanQuery, searchOpts);
  } catch (err) {
    console.warn(
      "[mem0] Recall search failed:",
      err instanceof Error ? err.message : err
    );
  }
  let sessionMemories = [];
  if (sessionId) {
    try {
      sessionMemories = await provider.search(cleanQuery, {
        ...searchOpts,
        run_id: sessionId,
        top_k: 5
      });
    } catch {
    }
  }
  const longTermIds = new Set(longTermMemories.map((m) => m.id));
  const uniqueSession = sessionMemories.filter((m) => !longTermIds.has(m.id));
  const allMemories = [...longTermMemories, ...uniqueSession];
  const ranked = rankMemories(allMemories, categoryOrder);
  const budgeted = budgetMemories(
    ranked,
    tokenBudget,
    maxMemories,
    identityAlwaysInclude
  );
  const context = formatRecalledMemories(budgeted, userId);
  const tokenEstimate = estimateTokens(context);
  return { context, memories: budgeted, tokenEstimate };
}

// telemetry.ts
import { createHash, randomUUID as randomUUID2 } from "crypto";

// ../agent-plugin-core/typescript/src/telemetry.ts
import { randomUUID } from "crypto";

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

// ../agent-plugin-core/typescript/src/prompts.ts
var SEARCH_WHEN = "before repeating investigation or when earlier decisions, fixes, commands, or results may help";
var SEARCH_TOOL_DESCRIPTION = `Search memories from earlier work in this repository. Use it ${SEARCH_WHEN}.`;
var RECALL_HEADING = "Mem0 found these relevant memories from earlier work in this repository:";
var USER_SEARCH_TOOL_DESCRIPTION = `Search memories from earlier work. Use it ${SEARCH_WHEN}.`;
var USER_SEARCH_QUERY_DESCRIPTION = "A direct question about earlier work.";

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
  recall(prompt, enabled2, search) {
    return buildRecallContext(prompt, enabled2, search, {
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
async function buildRecallContext(prompt, enabled2, search, options = {}) {
  if (!enabled2) return "";
  const query = boundedText(prompt, MAX_RECALL_QUERY_CHARS);
  if (!query) return "";
  try {
    let timer;
    let response;
    try {
      const timeout = new Promise((resolve2) => {
        timer = setTimeout(() => resolve2(null), options.timeoutMs ?? 2e3);
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

// cli/config-file.ts
import { join as join2 } from "path";
import { homedir } from "os";
var OPENCLAW_CONFIG_DIR = join2(homedir(), ".openclaw");
var OPENCLAW_CONFIG_FILE = join2(OPENCLAW_CONFIG_DIR, "openclaw.json");
var DEFAULT_BASE_URL = metamemAuthOrigin();
var PLUGIN_ID = "openclaw-mem0";
function readFullConfig() {
  if (!exists(OPENCLAW_CONFIG_FILE)) {
    return {};
  }
  const text = readText(OPENCLAW_CONFIG_FILE);
  if (!text.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Config is not a JSON object");
    }
    return parsed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[openclaw-mem0] Failed to parse ${OPENCLAW_CONFIG_FILE}: ${msg}
Fix the JSON syntax error manually before running config commands.`
    );
  }
}
function writeFullConfig(config) {
  if (!exists(OPENCLAW_CONFIG_DIR)) {
    mkdirp(OPENCLAW_CONFIG_DIR, 448);
  }
  if (exists(OPENCLAW_CONFIG_FILE)) {
    try {
      const diskText = readText(OPENCLAW_CONFIG_FILE);
      if (diskText.trim()) {
        const disk = JSON.parse(diskText);
        const diskPlugins = disk.plugins;
        const ourPlugins = config.plugins;
        if (diskPlugins && ourPlugins) {
          const OPENCLAW_MANAGED = ["installs", "slots"];
          for (const key of OPENCLAW_MANAGED) {
            if (key in diskPlugins) {
              ourPlugins[key] = diskPlugins[key];
            }
          }
          for (const key of Object.keys(diskPlugins)) {
            if (!(key in ourPlugins)) {
              ourPlugins[key] = diskPlugins[key];
            }
          }
        }
      }
    } catch {
    }
  }
  writeText(
    OPENCLAW_CONFIG_FILE,
    JSON.stringify(config, null, 2),
    { mode: 384 }
  );
}
function readPluginAuth() {
  const full = readFullConfig();
  const cfg = full?.plugins?.entries?.[PLUGIN_ID]?.config;
  if (!cfg || typeof cfg !== "object") return {};
  return {
    apiKey: cfg.apiKey ?? cfg.api_key,
    baseUrl: cfg.baseUrl ?? cfg.base_url,
    userId: cfg.userId ?? cfg.user_id,
    userEmail: cfg.userEmail ?? cfg.user_email,
    mode: cfg.mode,
    autoRecall: cfg.autoRecall,
    autoCapture: cfg.autoCapture,
    topK: cfg.topK,
    anonymousTelemetryId: cfg.anonymousTelemetryId,
    // Without this the reader silently drops it, every fingerprint comparison
    // fails against undefined, and the resolved email is never used again.
    keyFingerprint: cfg.keyFingerprint
  };
}
function writePluginAuth(auth) {
  const full = readFullConfig();
  ensurePluginStructure(full);
  const cfg = full.plugins.entries[PLUGIN_ID].config;
  for (const [key, value] of Object.entries(auth)) {
    if (value !== void 0) cfg[key] = value;
  }
  writeFullConfig(full);
}
function ensurePluginStructure(full) {
  if (!full.plugins) full.plugins = {};
  if (!full.plugins.entries) full.plugins.entries = {};
  if (!full.plugins.entries[PLUGIN_ID]) {
    full.plugins.entries[PLUGIN_ID] = { enabled: true, config: {} };
  }
  if (!full.plugins.entries[PLUGIN_ID].config) {
    full.plugins.entries[PLUGIN_ID].config = {};
  }
}
function writePluginConfigField(path2, value) {
  const full = readFullConfig();
  ensurePluginStructure(full);
  let target = full.plugins.entries[PLUGIN_ID].config;
  for (let i = 0; i < path2.length - 1; i++) {
    if (!target[path2[i]] || typeof target[path2[i]] !== "object") {
      target[path2[i]] = {};
    }
    target = target[path2[i]];
  }
  target[path2[path2.length - 1]] = value;
  writeFullConfig(full);
}
var DEFAULT_SKILLS_CONFIG = {
  triage: { enabled: true },
  recall: {
    enabled: true,
    tokenBudget: 1500,
    rerank: true,
    keywordSearch: true,
    identityAlwaysInclude: true
  },
  domain: "companion"
};
function enableSkillsConfig(userId) {
  const full = readFullConfig();
  ensurePluginStructure(full);
  const cfg = full.plugins.entries[PLUGIN_ID].config;
  if (!cfg.skills) {
    cfg.skills = { ...DEFAULT_SKILLS_CONFIG };
  }
  if (!full.tools) full.tools = {};
  full.tools.profile = "full";
  if (!full.hooks) full.hooks = {};
  if (!full.hooks.internal) full.hooks.internal = {};
  if (!full.hooks.internal.entries) full.hooks.internal.entries = {};
  full.hooks.internal.entries["session-memory"] = { enabled: false };
  writeFullConfig(full);
}
function getBaseUrl() {
  const auth = readPluginAuth();
  return auth.baseUrl || DEFAULT_BASE_URL;
}
function clearResolvedAccount() {
  const full = readFullConfig();
  const cfg = full?.plugins?.entries?.[PLUGIN_ID]?.config;
  if (!cfg) return;
  let changed = false;
  for (const key of ["userEmail", "keyFingerprint"]) {
    if (key in cfg) {
      delete cfg[key];
      changed = true;
    }
  }
  if (changed) writeFullConfig(full);
}
function clearAnonymousTelemetryId() {
  const full = readFullConfig();
  const cfg = full?.plugins?.entries?.[PLUGIN_ID]?.config;
  if (cfg && "anonymousTelemetryId" in cfg) {
    delete cfg.anonymousTelemetryId;
    writeFullConfig(full);
  }
}

// telemetry.ts
var PLUGIN_VERSION = "1.2.1";
var cachedAnonymousId;
var aliasCheckDone = false;
var resolutionAttemptedFor = "";
var currentDistinctId = "";
function enabled() {
  const value = globalThis.__mem0_telemetry_override ?? process.env.MEM0_TELEMETRY;
  return value === void 0 || !["false", "0", "no", "off"].includes(String(value).toLowerCase());
}
function anonymousId() {
  if (cachedAnonymousId) return cachedAnonymousId;
  try {
    const stored = readPluginAuth().anonymousTelemetryId;
    if (stored) return cachedAnonymousId = stored;
  } catch {
  }
  const created = `openclaw-anon-${randomUUID2().replace(/-/g, "")}`;
  try {
    writePluginAuth({ anonymousTelemetryId: created });
  } catch {
  }
  return cachedAnonymousId = created;
}
function keyFingerprint(apiKey) {
  return apiKey ? createHash("sha256").update(apiKey).digest("hex").slice(0, 16) : "";
}
function distinctId(apiKey) {
  try {
    const auth = readPluginAuth();
    if (auth.userEmail) {
      if (auth.keyFingerprint === keyFingerprint(apiKey)) {
        return createHash("sha256").update(auth.userEmail).digest("hex");
      }
      if (apiKey && auth.keyFingerprint) clearResolvedAccount();
    }
  } catch {
  }
  return apiKey ? createHash("sha256").update(apiKey).digest("hex") : anonymousId();
}
var telemetry = createTelemetry({
  host: "openclaw",
  source: "OPENCLAW",
  version: PLUGIN_VERSION,
  distinctId: () => currentDistinctId,
  enabled
});
function identifyAnonymous(id) {
  if (aliasCheckDone || id.startsWith("openclaw-anon-")) return;
  try {
    const anonymous = readPluginAuth().anonymousTelemetryId;
    aliasCheckDone = true;
    if (!anonymous) return;
    telemetry.capture("$identify", { $anon_distinct_id: anonymous });
    clearAnonymousTelemetryId();
    cachedAnonymousId = void 0;
  } catch {
  }
}
function resolveEmail(apiKey) {
  const fingerprint = keyFingerprint(apiKey);
  if (resolutionAttemptedFor === fingerprint) return;
  resolutionAttemptedFor = fingerprint;
  const releaseLatch = () => {
    if (resolutionAttemptedFor === fingerprint) resolutionAttemptedFor = "";
  };
  fetch(`${getBaseUrl().replace(/\/+$/, "")}/v1/ping/`, {
    method: "GET",
    headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(5e3)
  }).then((response) => response.json()).then((data) => {
    if (!data?.user_email) return;
    writePluginAuth({ userEmail: data.user_email, keyFingerprint: fingerprint });
    const oldId = createHash("sha256").update(apiKey).digest("hex");
    const newId = createHash("sha256").update(data.user_email).digest("hex");
    for (const event of telemetry.queueForTesting()) {
      if (event.distinct_id === oldId) event.distinct_id = newId;
    }
  }).catch(() => {
    releaseLatch();
  });
}
function captureEvent(eventName, properties = {}, context) {
  if (!enabled()) return;
  try {
    currentDistinctId = distinctId(context?.apiKey);
    let resolvedForThisKey = false;
    try {
      const auth = readPluginAuth();
      resolvedForThisKey = Boolean(auth.userEmail) && auth.keyFingerprint === keyFingerprint(context?.apiKey);
    } catch {
    }
    if (context?.apiKey && !resolvedForThisKey) resolveEmail(context.apiKey);
    identifyAnonymous(currentDistinctId);
    telemetry.capture(eventName, {
      mode: context?.mode,
      skills_active: context?.skillsActive,
      ...properties
    });
  } catch {
  }
}

// backend/base.ts
var AuthError = class extends Error {
  constructor(message = "Authentication failed. Your API key may be invalid or expired.") {
    super(message);
    this.name = "AuthError";
  }
};
var NotFoundError = class extends Error {
  constructor(path2) {
    super(`Resource not found: ${path2}`);
    this.name = "NotFoundError";
  }
};
var APIError = class extends Error {
  constructor(path2, detail) {
    super(`Bad request to ${path2}: ${detail}`);
    this.name = "APIError";
  }
};

// backend/platform.ts
var PlatformBackend = class {
  baseUrl;
  headers;
  constructor(config) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.headers = {
      Authorization: `Token ${config.apiKey}`,
      "Content-Type": "application/json",
      "X-Mem0-Source": "OPENCLAW",
      "X-Mem0-Client-Language": "node",
      "X-Mem0-Client-Version": PLUGIN_VERSION,
      "X-Mem0-Caller-Type": "plugin"
    };
  }
  async _request(method, path2, opts) {
    let url = `${this.baseUrl}${path2}`;
    if (opts?.params) {
      const qs = new URLSearchParams(opts.params).toString();
      url += `?${qs}`;
    }
    const fetchOpts = {
      method,
      headers: this.headers,
      signal: AbortSignal.timeout(3e4)
    };
    if (opts?.json) {
      fetchOpts.body = JSON.stringify(opts.json);
    }
    const resp = await fetch(url, fetchOpts);
    if (resp.status === 401) {
      throw new AuthError();
    }
    if (resp.status === 404) {
      throw new NotFoundError(path2);
    }
    if (resp.status === 400) {
      let detail;
      try {
        const body = await resp.json();
        detail = body.detail ?? body.message ?? JSON.stringify(body) ?? resp.statusText;
      } catch {
        detail = resp.statusText;
      }
      throw new APIError(path2, detail);
    }
    if (!resp.ok) {
      let detail = resp.statusText;
      try {
        const body = await resp.json();
        detail = body.detail ?? body.message ?? resp.statusText;
      } catch {
      }
      throw new Error(`HTTP ${resp.status}: ${detail}`);
    }
    if (resp.status === 204) {
      return {};
    }
    return resp.json();
  }
  async add(content, messages, opts = {}) {
    const payload = {};
    if (messages) {
      payload.messages = messages;
    } else if (content) {
      payload.messages = [{ role: "user", content }];
    }
    if (opts.userId) payload.user_id = opts.userId;
    if (opts.agentId) payload.agent_id = opts.agentId;
    if (opts.appId) payload.app_id = opts.appId;
    if (opts.runId) payload.run_id = opts.runId;
    if (opts.metadata) payload.metadata = opts.metadata;
    if (opts.infer === false) payload.infer = false;
    if (opts.categories) payload.categories = opts.categories;
    return await this._request("POST", "/v1/memories/", {
      json: payload
    });
  }
  _buildFilters(opts) {
    if (opts.extraFilters && ("AND" in opts.extraFilters || "OR" in opts.extraFilters)) {
      return opts.extraFilters;
    }
    const andConditions = [];
    if (opts.userId) andConditions.push({ user_id: opts.userId });
    if (opts.agentId) andConditions.push({ agent_id: opts.agentId });
    if (opts.appId) andConditions.push({ app_id: opts.appId });
    if (opts.runId) andConditions.push({ run_id: opts.runId });
    if (opts.extraFilters) {
      for (const [k, v] of Object.entries(opts.extraFilters)) {
        andConditions.push({ [k]: v });
      }
    }
    if (andConditions.length === 1) return andConditions[0];
    if (andConditions.length > 1) return { AND: andConditions };
    return void 0;
  }
  async search(query, opts = {}) {
    const payload = {
      query,
      top_k: opts.topK ?? 10,
      threshold: opts.threshold ?? 0.3
    };
    const apiFilters = this._buildFilters({
      userId: opts.userId,
      agentId: opts.agentId,
      appId: opts.appId,
      runId: opts.runId,
      extraFilters: opts.filters
    });
    if (apiFilters) payload.filters = apiFilters;
    if (opts.rerank) payload.rerank = true;
    if (opts.fields) payload.fields = opts.fields;
    const result = await this._request("POST", "/v2/memories/search/", {
      json: payload
    });
    if (Array.isArray(result)) return result;
    const obj = result;
    return obj.results ?? obj.memories ?? [];
  }
  async get(memoryId) {
    return await this._request("GET", `/v1/memories/${memoryId}/`);
  }
  async listMemories(opts = {}) {
    const payload = {};
    const params = {
      page: String(opts.page ?? 1),
      page_size: String(opts.pageSize ?? 100)
    };
    const extra = {};
    if (opts.category) {
      extra.categories = { contains: opts.category };
    }
    if (opts.after) {
      extra.created_at = {
        ...extra.created_at,
        gte: opts.after
      };
    }
    if (opts.before) {
      extra.created_at = {
        ...extra.created_at,
        lte: opts.before
      };
    }
    const apiFilters = this._buildFilters({
      userId: opts.userId,
      agentId: opts.agentId,
      appId: opts.appId,
      runId: opts.runId,
      extraFilters: Object.keys(extra).length > 0 ? extra : void 0
    });
    if (apiFilters) payload.filters = apiFilters;
    const result = await this._request("POST", "/v2/memories/", {
      json: payload,
      params
    });
    if (Array.isArray(result)) return result;
    const obj = result;
    return obj.results ?? obj.memories ?? [];
  }
  async update(memoryId, content, metadata) {
    const payload = {};
    if (content) payload.text = content;
    if (metadata) payload.metadata = metadata;
    return await this._request("PUT", `/v1/memories/${memoryId}/`, {
      json: payload
    });
  }
  async delete(memoryId, opts = {}) {
    if (opts.all) {
      const params = {};
      if (opts.userId) params.user_id = opts.userId;
      if (opts.agentId) params.agent_id = opts.agentId;
      if (opts.appId) params.app_id = opts.appId;
      if (opts.runId) params.run_id = opts.runId;
      return await this._request("DELETE", "/v1/memories/", {
        params
      });
    }
    if (memoryId) {
      return await this._request(
        "DELETE",
        `/v1/memories/${memoryId}/`
      );
    }
    throw new Error("Either memoryId or --all is required");
  }
  async deleteEntities(opts) {
    const typeMap = [
      ["user", opts.userId],
      ["agent", opts.agentId],
      ["app", opts.appId],
      ["run", opts.runId]
    ];
    const entities = typeMap.filter(([, v]) => v);
    if (entities.length === 0) {
      throw new Error("At least one entity ID is required for deleteEntities.");
    }
    let result = {};
    for (const [entityType, entityId] of entities) {
      result = await this._request(
        "DELETE",
        `/v2/entities/${entityType}/${entityId}/`
      );
    }
    return result;
  }
  async ping() {
    return await this._request("GET", "/v1/ping/");
  }
  async status(_opts = {}) {
    try {
      await this.ping();
      return { connected: true, backend: "platform", base_url: this.baseUrl };
    } catch (e) {
      return {
        connected: false,
        backend: "platform",
        error: e instanceof Error ? e.message : String(e)
      };
    }
  }
  async entities(entityType) {
    const result = await this._request("GET", "/v1/entities/");
    let items;
    if (Array.isArray(result)) {
      items = result;
    } else {
      items = result.results ?? [];
    }
    const typeMap = {
      users: "user",
      agents: "agent",
      apps: "app",
      runs: "run"
    };
    const targetType = typeMap[entityType];
    if (targetType) {
      items = items.filter(
        (e) => e.type?.toLowerCase() === targetType
      );
    }
    return items;
  }
  async listEvents() {
    const result = await this._request("GET", "/v1/events/");
    if (Array.isArray(result)) return result;
    return result.results ?? [];
  }
  async getEvent(eventId) {
    return await this._request("GET", `/v1/event/${eventId}/`);
  }
};

// cli/commands.ts
import { createInterface } from "readline";
import { userInfo as osUserInfo } from "os";

// cli/json-helpers.ts
function writeStdout(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}
function jsonOut(opts, data) {
  if (!opts.json) return false;
  writeStdout(data);
  return true;
}
function jsonErr(opts, error) {
  if (!opts.json) return false;
  writeStdout({ ok: false, error });
  return true;
}
function redactSecrets2(obj, secretKeys) {
  const result = { ...obj };
  for (const key of secretKeys) {
    const val = result[key];
    if (typeof val !== "string") continue;
    result[key] = val.length <= 8 ? val.slice(0, 2) + "***" : val.slice(0, 4) + "..." + val.slice(-4);
  }
  return result;
}

// cli/oss-wizard.ts
import "path";
import "os";
var LLM_PROVIDERS = [
  { id: "openai", label: "OpenAI (requires API key)", needsApiKey: true, needsUrl: false, envVar: "OPENAI_API_KEY", defaultModel: "gpt-5-mini" },
  { id: "ollama", label: "Ollama (local, no API key)", needsApiKey: false, needsUrl: true, defaultModel: "llama3.1:8b", defaultUrl: "http://localhost:11434" },
  { id: "anthropic", label: "Anthropic (requires API key)", needsApiKey: true, needsUrl: false, envVar: "ANTHROPIC_API_KEY", defaultModel: "claude-sonnet-4-5-20250514" }
];
var EMBEDDER_PROVIDERS = [
  { id: "openai", label: "OpenAI (requires API key)", needsApiKey: true, needsUrl: false, envVar: "OPENAI_API_KEY", defaultModel: "text-embedding-3-small", defaultDims: 1536 },
  { id: "ollama", label: "Ollama (local, no API key)", needsApiKey: false, needsUrl: true, defaultModel: "nomic-embed-text", defaultUrl: "http://localhost:11434", defaultDims: 768 }
];
var VECTOR_PROVIDERS = [
  { id: "qdrant", label: "Qdrant (requires server \u2014 Docker or cloud)", needsConnection: true, defaultUrl: "http://localhost:6333", defaultPort: 6333, setupHint: "docker run -d -p 6333:6333 qdrant/qdrant" },
  { id: "pgvector", label: "PGVector (requires PostgreSQL + pgvector extension)", needsConnection: true, defaultPort: 5432, setupHint: "docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres pgvector/pgvector:pg17" }
];
var KNOWN_EMBEDDER_DIMS = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
  "nomic-embed-text": 768,
  "mxbai-embed-large": 1024,
  "all-minilm": 384,
  "snowflake-arctic-embed": 1024
};
function collectionNameForDims(dims) {
  return `mem0_${dims}d`;
}
function buildOssLlmConfig(providerId, input) {
  const def = LLM_PROVIDERS.find((p) => p.id === providerId);
  if (!def) throw new Error(`Unknown LLM provider: ${providerId}`);
  const config = {
    model: input.model || def.defaultModel
  };
  if (input.apiKey) config.apiKey = input.apiKey;
  if (providerId === "ollama") {
    config.url = input.url || def.defaultUrl;
  }
  return { provider: providerId, config };
}
function buildOssEmbedderConfig(providerId, input) {
  const def = EMBEDDER_PROVIDERS.find((p) => p.id === providerId);
  if (!def) throw new Error(`Unknown embedder provider: ${providerId}`);
  const model = input.model || def.defaultModel;
  const config = { model };
  if (input.apiKey) config.apiKey = input.apiKey;
  if (providerId === "ollama") {
    config.url = input.url || def.defaultUrl;
  }
  const dims = KNOWN_EMBEDDER_DIMS[model] ?? def.defaultDims;
  if (dims) config.embeddingDims = dims;
  return { provider: providerId, config, dims };
}
function buildOssVectorConfig(providerId, input) {
  const config = {};
  if (providerId === "qdrant") {
    config.url = input.url || "http://localhost:6333";
    config.onDisk = true;
    if (input.apiKey) config.apiKey = input.apiKey;
  } else if (providerId === "pgvector") {
    config.host = input.host || "localhost";
    config.port = parseInt(input.port || "5432", 10);
    if (input.user) config.user = input.user;
    if (input.password) config.password = input.password;
    config.dbname = input.dbname || "postgres";
  }
  if (input.dims) {
    config.dimension = input.dims;
    config.embeddingModelDims = input.dims;
    config.collectionName = collectionNameForDims(input.dims);
  }
  return { provider: providerId, config };
}
async function checkOllamaConnectivity(url) {
  try {
    const resp = await fetch(`${url.replace(/\/+$/, "")}/api/tags`, { signal: AbortSignal.timeout(3e3) });
    if (resp.ok) return { ok: true };
    return { ok: false, error: `Ollama returned HTTP ${resp.status}` };
  } catch {
    return { ok: false, error: `Cannot reach Ollama at ${url}. Install: https://ollama.com/download` };
  }
}
async function checkPgConnectivity(host, port) {
  return new Promise((resolve2) => {
    import("net").then(({ createConnection }) => {
      const sock = createConnection({ host, port, timeout: 3e3 });
      sock.once("connect", () => {
        sock.destroy();
        resolve2({ ok: true });
      });
      sock.once("timeout", () => {
        sock.destroy();
        resolve2({ ok: false, error: `PostgreSQL not reachable at ${host}:${port}` });
      });
      sock.once("error", () => {
        sock.destroy();
        resolve2({ ok: false, error: `PostgreSQL not reachable at ${host}:${port}. Ensure PostgreSQL with pgvector extension is running.` });
      });
    });
  });
}
async function checkQdrantConnectivity(url) {
  try {
    const resp = await fetch(`${url.replace(/\/+$/, "")}/healthz`, { signal: AbortSignal.timeout(3e3) });
    if (resp.ok) return { ok: true };
    return { ok: false, error: `Qdrant returned HTTP ${resp.status}` };
  } catch (err) {
    return { ok: false, error: `Cannot reach Qdrant at ${url}. Start it with: docker run -d -p 6333:6333 qdrant/qdrant` };
  }
}
function validateOssFlags(flags) {
  const llmId = flags.ossLlm || "openai";
  const llmDef = LLM_PROVIDERS.find((p) => p.id === llmId);
  if (!llmDef) return { error: `Unknown LLM provider: ${llmId}. Valid: ${LLM_PROVIDERS.map((p) => p.id).join(", ")}` };
  if (llmDef.needsApiKey && !flags.ossLlmKey) {
    return { error: `--oss-llm-key required when --oss-llm is ${llmId}` };
  }
  const embId = flags.ossEmbedder || "openai";
  const embDef = EMBEDDER_PROVIDERS.find((p) => p.id === embId);
  if (!embDef) return { error: `Unknown embedder provider: ${embId}. Valid: ${EMBEDDER_PROVIDERS.map((p) => p.id).join(", ")}` };
  if (embDef.needsApiKey && !flags.ossEmbedderKey && !flags.ossLlmKey) {
    return { error: `--oss-embedder-key required when --oss-embedder is ${embId}` };
  }
  const vecId = flags.ossVector || "qdrant";
  const vecDef = VECTOR_PROVIDERS.find((p) => p.id === vecId);
  if (!vecDef) return { error: `Unknown vector store provider: ${vecId}. Valid: ${VECTOR_PROVIDERS.map((p) => p.id).join(", ")}` };
  if (vecId === "pgvector" && !flags.ossVectorUser) {
    return { error: "--oss-vector-user required when --oss-vector is pgvector" };
  }
  return {};
}

// cli/commands.ts
function promptInput(question, prefill) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve2) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve2(answer.trim());
    });
    if (prefill) rl.write(prefill);
  });
}
function getSystemUsername() {
  try {
    return osUserInfo().username || "default";
  } catch {
    return "default";
  }
}
function resolveUserId2(flagValue, existingValue) {
  if (flagValue) return flagValue;
  if (existingValue) return existingValue;
  return getSystemUsername();
}
async function apiPost(url, body, errorPrefix) {
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mem0-Source": "OPENCLAW",
        "X-Mem0-Client-Language": "node"
      },
      body: JSON.stringify(body)
    });
  } catch (err) {
    console.error(`Could not reach ${url}: ${String(err)}`);
    return null;
  }
  if (resp.status === 429) {
    console.error("Too many attempts. Try again in a few minutes.");
    return null;
  }
  if (!resp.ok) {
    let detail;
    try {
      const data = await resp.json();
      detail = String(data.error ?? resp.statusText);
    } catch {
      detail = resp.statusText;
    }
    console.error(`${errorPrefix}: ${detail}`);
    return null;
  }
  try {
    return await resp.json();
  } catch {
    return {};
  }
}
async function validateApiKey(baseUrl, apiKey) {
  try {
    const resp = await fetch(`${baseUrl}/v1/ping/`, {
      headers: {
        Authorization: `Token ${apiKey}`,
        "X-Mem0-Source": "OPENCLAW",
        "X-Mem0-Client-Language": "node"
      }
    });
    if (!resp.ok) return { ok: false, status: resp.status };
    try {
      const data = await resp.json();
      return { ok: true, userEmail: data.user_email };
    } catch {
      return { ok: true };
    }
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
async function sendVerificationCode(baseUrl, email) {
  const url = baseUrl.replace(/\/+$/, "");
  const result = await apiPost(
    `${url}/api/v1/auth/email_code/`,
    { email },
    "Failed to send code"
  );
  return result !== null;
}
async function verifyEmailCode(baseUrl, email, code) {
  const url = baseUrl.replace(/\/+$/, "");
  const result = await apiPost(
    `${url}/api/v1/auth/email_code/verify/`,
    { email, code: code.trim() },
    "Verification failed"
  );
  if (!result) return null;
  const apiKey = result.api_key;
  if (!apiKey) {
    console.error(
      "Auth succeeded but no API key was returned. Contact support."
    );
    return null;
  }
  return apiKey;
}
function saveLoginConfig(apiKey, userIdFlag, userEmail, silent) {
  const existingAuth = readPluginAuth();
  const userId = resolveUserId2(userIdFlag, existingAuth.userId);
  writePluginAuth({ apiKey, userId, mode: "platform", ...userEmail && { userEmail } });
  enableSkillsConfig(userId);
  if (!silent) {
    console.log(`  Configuration saved to ${OPENCLAW_CONFIG_FILE}`);
    console.log(`  Mode: platform (skills enabled)`);
    console.log(`  User ID: ${userId}`);
  }
}
function saveOssConfig(userIdFlag, silent) {
  const existingAuth = readPluginAuth();
  const userId = resolveUserId2(userIdFlag, existingAuth.userId);
  writePluginAuth({ apiKey: "", userId, mode: "open-source" });
  enableSkillsConfig(userId);
  if (!silent) {
    console.log(`  Configuration saved to ${OPENCLAW_CONFIG_FILE}`);
    console.log(`  Mode: open-source (skills enabled)`);
    console.log(`  User ID: ${userId}`);
  }
}
async function runOssWizardInteractive(opts, existingAuth) {
  console.log("\n  Step 1/4 \u2014 LLM Provider\n");
  LLM_PROVIDERS.forEach((p, i) => console.log(`    ${i + 1}. ${p.label}`));
  console.log("");
  const llmIdx = parseInt(await promptInput(`  Choice (1-${LLM_PROVIDERS.length}): `) || "1", 10) - 1;
  const llmDef = LLM_PROVIDERS[llmIdx] || LLM_PROVIDERS[0];
  let llmApiKey;
  let llmUrl;
  if (llmDef.needsApiKey) {
    llmApiKey = await promptInput(`  ${llmDef.envVar} API Key (Enter to use env var): `);
    if (!llmApiKey) llmApiKey = void 0;
  }
  if (llmDef.needsUrl) {
    llmUrl = await promptInput(`  Base URL: `, llmDef.defaultUrl) || llmDef.defaultUrl;
  }
  const llmCfg = buildOssLlmConfig(llmDef.id, { apiKey: llmApiKey, url: llmUrl });
  if (llmDef.id === "ollama") {
    const ollamaUrl = llmCfg.config.url || "http://localhost:11434";
    const check = await checkOllamaConnectivity(ollamaUrl);
    if (!check.ok) {
      console.error(`
  \u26A0 Ollama not reachable at ${ollamaUrl}. Install: https://ollama.com/download
`);
      return;
    }
    console.log("  \u2713 Ollama connected");
  }
  writePluginConfigField(["oss", "llm"], llmCfg);
  console.log("\n  Step 2/4 \u2014 Embedding Provider\n");
  EMBEDDER_PROVIDERS.forEach((p, i) => console.log(`    ${i + 1}. ${p.label}`));
  console.log("");
  const embIdx = parseInt(await promptInput(`  Choice (1-${EMBEDDER_PROVIDERS.length}): `) || "1", 10) - 1;
  const embDef = EMBEDDER_PROVIDERS[embIdx] || EMBEDDER_PROVIDERS[0];
  let embApiKey;
  let embUrl;
  if (embDef.needsApiKey) {
    if (embDef.id === llmDef.id && llmApiKey) {
      console.log(`  Reusing ${llmDef.id} API key from Step 1`);
      embApiKey = llmApiKey;
    } else {
      embApiKey = await promptInput(`  ${embDef.envVar} API Key (Enter to use env var): `);
      if (!embApiKey) embApiKey = void 0;
    }
  }
  if (embDef.needsUrl) {
    if (embDef.id === llmDef.id && llmUrl) {
      console.log(`  Reusing ${llmDef.id} base URL from Step 1`);
      embUrl = llmUrl;
    } else {
      embUrl = await promptInput(`  Base URL: `, embDef.defaultUrl) || embDef.defaultUrl;
    }
  }
  const embCfg = buildOssEmbedderConfig(embDef.id, { apiKey: embApiKey, url: embUrl });
  if (embDef.id === "ollama" && embDef.id !== llmDef.id) {
    const ollamaUrl = embCfg.config.url || "http://localhost:11434";
    const check = await checkOllamaConnectivity(ollamaUrl);
    if (!check.ok) {
      console.error(`
  \u26A0 Ollama not reachable at ${ollamaUrl}. Install: https://ollama.com/download
`);
      return;
    }
    console.log("  \u2713 Ollama connected");
  }
  writePluginConfigField(["oss", "embedder"], { provider: embCfg.provider, config: embCfg.config });
  const dims = embCfg.dims ?? embDef.defaultDims;
  console.log("\n  Step 3/4 \u2014 Vector Store\n");
  VECTOR_PROVIDERS.forEach((p, i) => console.log(`    ${i + 1}. ${p.label}`));
  console.log("");
  const vecIdx = parseInt(await promptInput(`  Choice (1-${VECTOR_PROVIDERS.length}): `) || "1", 10) - 1;
  const vecDef = VECTOR_PROVIDERS[vecIdx] || VECTOR_PROVIDERS[0];
  let vecInput = { dims };
  if (vecDef.id === "qdrant") {
    if (vecDef.setupHint) console.log(`
  Hint: ${vecDef.setupHint}`);
    console.log("");
    const url = await promptInput(`  Qdrant URL: `, vecDef.defaultUrl) || vecDef.defaultUrl;
    vecInput = { url, dims };
    const check = await checkQdrantConnectivity(url);
    if (!check.ok) {
      console.error(`
  \u26A0 Qdrant not reachable at ${url}. Start with: docker run -d -p 6333:6333 qdrant/qdrant
`);
      return;
    }
    console.log("  \u2713 Qdrant connected");
  } else if (vecDef.id === "pgvector") {
    if (vecDef.setupHint) console.log(`
  Hint: ${vecDef.setupHint}`);
    console.log("");
    const host = await promptInput("  Host [localhost]: ") || "localhost";
    const port = await promptInput("  Port [5432]: ") || "5432";
    const user = await promptInput("  User: ");
    const password = await promptInput("  Password: ");
    const dbname = await promptInput("  Database [postgres]: ") || "postgres";
    vecInput = { host, port, user, password, dbname, dims };
    const check = await checkPgConnectivity(host, parseInt(port, 10));
    if (!check.ok) {
      console.error(`
  \u26A0 PostgreSQL not reachable at ${host}:${port}. ${vecDef.setupHint ? `Start with: ${vecDef.setupHint}` : ""}
`);
      return;
    }
    console.log("  \u2713 PostgreSQL connected");
  }
  const vecCfg = buildOssVectorConfig(vecDef.id, vecInput);
  const existingVecCfg = existingAuth;
  const oldDims = existingVecCfg?.oss?.vectorStore?.config?.dimension;
  if (oldDims && dims && oldDims !== dims) {
    console.log(`
  \u26A0 Dimension change detected: ${oldDims} \u2192 ${dims}`);
    console.log(`    Old collection had ${oldDims}-dim vectors. New embedder produces ${dims}-dim vectors.`);
    console.log(`    A new collection "${collectionNameForDims(dims)}" will be created.`);
    console.log(`    Old memories in the previous collection will NOT be accessible with the new embedder.
`);
  }
  writePluginConfigField(["oss", "vectorStore"], vecCfg);
  console.log("\n  Step 4/4 \u2014 User ID\n");
  let userIdValue = opts.userId;
  if (!userIdValue) {
    const defaultUid = resolveUserId2(void 0, existingAuth.userId);
    const uidInput = await promptInput(`  User ID: `, defaultUid);
    userIdValue = uidInput || defaultUid;
  }
  console.log("");
  saveOssConfig(userIdValue);
  console.log("");
  console.log("  Open-source mode configured!");
  console.log("");
  console.log(`    LLM:       ${llmDef.id} (${llmCfg.config.model})`);
  console.log(`    Embedder:  ${embDef.id} (${embCfg.config.model})`);
  console.log(`    Vector:    ${vecDef.id} (${vecDef.id === "qdrant" ? vecCfg.config.url : vecCfg.config.host})`);
  console.log(`    Dims:      ${dims ?? "unknown"}`);
  console.log(`    Collection:${dims ? " " + collectionNameForDims(dims) : " (default)"}`);
  console.log(`    User ID:   ${userIdValue}`);
  console.log("");
  console.log("  Run: openclaw gateway restart");
  console.log("");
}
function registerCliCommands(api, backend, provider, cfg, effectiveUserId2, agentUserId2, buildSearchOptions, getCurrentSessionId, captureCliEvent) {
  api.registerCli(
    ({ program }) => {
      const mem0 = program.command("mem0").description("Mem0 memory plugin commands\n\nTip: All commands support --json for machine-readable output (for LLM agents)").configureHelp({ sortSubcommands: false, subcommandTerm: (cmd) => cmd.name() });
      if (captureCliEvent) {
        mem0.hook("preAction", (_thisCmd, actionCmd) => {
          try {
            const name = actionCmd.name();
            const parent = actionCmd.parent?.name();
            const full = parent && parent !== "mem0" ? `${parent}.${name}` : name;
            captureCliEvent(full);
          } catch {
          }
        });
      }
      mem0.command("init").description("Set up Mem0 \u2014 authenticate and configure").option("--email <email>", "Login via email verification code").option("--code <code>", "Verification code (use with --email)").option("--api-key <key>", "Direct API key entry").option("--user-id <id>", "Set user ID for memory namespace").option("--mode <mode>", "platform or open-source (skips menu)").option("--oss-llm <provider>", "LLM: openai, ollama, anthropic").option("--oss-llm-key <key>", "API key for LLM provider").option("--oss-llm-model <model>", "Override default LLM model").option("--oss-llm-url <url>", "Base URL (ollama only)").option("--oss-embedder <provider>", "Embedder: openai, ollama, huggingface").option("--oss-embedder-key <key>", "API key for embedder").option("--oss-embedder-model <model>", "Override default embedder model").option("--oss-embedder-url <url>", "Base URL (ollama only)").option("--oss-vector <provider>", "Vector store: qdrant, pgvector").option("--oss-vector-url <url>", "Qdrant server URL (default: http://localhost:6333)").option("--oss-vector-host <host>", "PGVector host").option("--oss-vector-port <port>", "PGVector port").option("--oss-vector-user <user>", "PGVector user").option("--oss-vector-password <pw>", "PGVector password").option("--oss-vector-dbname <db>", "PGVector database name").option("--oss-vector-dims <n>", "Override embedding dimensions").option("--json", "Machine-readable JSON output").action(
        async (opts) => {
          try {
            const baseUrl = metamemAuthOrigin();
            const existingAuth = readPluginAuth();
            const hasExistingConfig = !!(existingAuth.apiKey || existingAuth.mode);
            if (opts.mode === "open-source") {
              const validation = validateOssFlags(opts);
              if (validation.error) {
                if (jsonErr(opts, validation.error)) return;
                console.error(validation.error);
                return;
              }
              const llmId = opts.ossLlm || "openai";
              const embId = opts.ossEmbedder || "openai";
              const vecId = opts.ossVector || "qdrant";
              const embKey = opts.ossEmbedderKey || (embId === llmId ? opts.ossLlmKey : void 0);
              const embUrl = opts.ossEmbedderUrl || (embId === llmId ? opts.ossLlmUrl : void 0);
              const llmCfg = buildOssLlmConfig(llmId, {
                apiKey: opts.ossLlmKey,
                model: opts.ossLlmModel,
                url: opts.ossLlmUrl
              });
              const embCfg = buildOssEmbedderConfig(embId, {
                apiKey: embKey,
                model: opts.ossEmbedderModel,
                url: embUrl
              });
              const dims = opts.ossVectorDims ? parseInt(opts.ossVectorDims, 10) : embCfg.dims;
              const vecCfg = buildOssVectorConfig(vecId, {
                url: opts.ossVectorUrl,
                host: opts.ossVectorHost,
                port: opts.ossVectorPort,
                user: opts.ossVectorUser,
                password: opts.ossVectorPassword,
                dbname: opts.ossVectorDbname,
                dims
              });
              const ollamaUrls = /* @__PURE__ */ new Set();
              if (llmId === "ollama") ollamaUrls.add(llmCfg.config.url || "http://localhost:11434");
              if (embId === "ollama") ollamaUrls.add(embCfg.config.url || "http://localhost:11434");
              for (const oUrl of ollamaUrls) {
                const check = await checkOllamaConnectivity(oUrl);
                if (!check.ok) {
                  const msg = `Ollama not reachable at ${oUrl}. Install: https://ollama.com/download`;
                  if (jsonErr(opts, msg)) return;
                  console.error(`
  ${msg}
`);
                  return;
                }
              }
              if (vecId === "qdrant") {
                const qdrantUrl = vecCfg.config.url || "http://localhost:6333";
                const check = await checkQdrantConnectivity(qdrantUrl);
                if (!check.ok) {
                  const msg = `Qdrant not reachable at ${qdrantUrl}. Start with: docker run -d -p 6333:6333 qdrant/qdrant`;
                  if (jsonErr(opts, msg)) return;
                  console.error(`
  ${msg}
`);
                  return;
                }
              } else if (vecId === "pgvector") {
                const pgHost = vecCfg.config.host || "localhost";
                const pgPort = vecCfg.config.port || 5432;
                const check = await checkPgConnectivity(pgHost, pgPort);
                if (!check.ok) {
                  const msg = `PostgreSQL not reachable at ${pgHost}:${pgPort}. Start with: docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres pgvector/pgvector:pg17`;
                  if (jsonErr(opts, msg)) return;
                  console.error(`
  ${msg}
`);
                  return;
                }
              }
              const prevAuth = readPluginAuth();
              const prevDims = prevAuth?.oss?.vectorStore?.config?.dimension;
              const newDims = dims;
              let dimWarning;
              if (prevDims && newDims && prevDims !== newDims) {
                dimWarning = `Dimension change: ${prevDims} \u2192 ${newDims}. New collection "${collectionNameForDims(newDims)}" will be used. Old memories not accessible with new embedder.`;
              }
              writePluginConfigField(["oss", "llm"], llmCfg);
              writePluginConfigField(["oss", "embedder"], { provider: embCfg.provider, config: embCfg.config });
              writePluginConfigField(["oss", "vectorStore"], vecCfg);
              saveOssConfig(opts.userId, !!opts.json);
              const vecDisplay = vecId === "qdrant" ? vecCfg.config.url : vecCfg.config.host;
              const summary = {
                ok: true,
                mode: "open-source",
                config: {
                  llm: { provider: llmCfg.provider, model: llmCfg.config.model },
                  embedder: { provider: embCfg.provider, model: embCfg.config.model, dims: newDims },
                  vectorStore: { provider: vecCfg.provider, ...vecId === "qdrant" ? { url: vecCfg.config.url } : { host: vecCfg.config.host }, collectionName: newDims ? collectionNameForDims(newDims) : void 0 }
                },
                ...dimWarning && { warning: dimWarning },
                userId: resolveUserId2(opts.userId, existingAuth.userId),
                message: "Open-source mode configured. Restart the gateway: openclaw gateway restart"
              };
              if (jsonOut(opts, summary)) return;
              console.log("\n  Open-source mode configured!\n");
              console.log(`  LLM:       ${llmCfg.provider} (${llmCfg.config.model})`);
              console.log(`  Embedder:  ${embCfg.provider} (${embCfg.config.model})`);
              console.log(`  Vector:    ${vecCfg.provider} (${vecDisplay})`);
              console.log(`  User ID:   ${resolveUserId2(opts.userId, existingAuth.userId)}`);
              console.log("\n  Restart the gateway: openclaw gateway restart\n");
              return;
            }
            if (opts.mode === "platform") {
              if (!opts.apiKey && !opts.email) {
                const msg = "--api-key or --email required for platform mode";
                if (jsonErr(opts, msg)) return;
                console.error(msg);
                return;
              }
            }
            if (opts.apiKey) {
              if (opts.email) {
                const msg = "Cannot use both --api-key and --email.";
                if (jsonErr(opts, msg)) return;
                console.error(msg);
                return;
              }
              const check = await validateApiKey(baseUrl, opts.apiKey);
              saveLoginConfig(opts.apiKey, opts.userId, check.userEmail, !!opts.json);
              let message;
              if (check.ok) {
                message = "API key validated. Connected to Mem0 Platform.";
              } else if (check.status) {
                message = `API key saved but validation returned HTTP ${check.status}. Check that the key is correct.`;
              } else {
                message = `API key saved but could not reach ${baseUrl}: ${check.error}. Check your network connection.`;
              }
              const summary = {
                ok: check.ok,
                mode: "platform",
                userId: resolveUserId2(opts.userId, existingAuth.userId),
                validated: check.ok,
                ...check.status && !check.ok && { httpStatus: check.status },
                message
              };
              if (jsonOut(opts, summary)) return;
              if (hasExistingConfig) {
                console.log(
                  "  Existing configuration detected \u2014 updated API key (other settings preserved)."
                );
              }
              if (check.ok) {
                console.log(`  ${message}`);
              } else {
                console.warn(`  ${message}`);
              }
              console.log(
                "  Restart the gateway: openclaw gateway restart\n"
              );
              return;
            }
            if (opts.email && opts.code) {
              const email = opts.email.trim().toLowerCase();
              const apiKey = await verifyEmailCode(baseUrl, email, opts.code);
              if (!apiKey) {
                if (jsonErr(opts, "Email verification failed \u2014 no API key returned.")) return;
                return;
              }
              saveLoginConfig(apiKey, opts.userId, email, !!opts.json);
              const summary = {
                ok: true,
                mode: "platform",
                userId: resolveUserId2(opts.userId, existingAuth.userId),
                email,
                message: "Authenticated. Restart the gateway: openclaw gateway restart"
              };
              if (jsonOut(opts, summary)) return;
              if (hasExistingConfig) {
                console.log(
                  "  Existing configuration detected \u2014 updated API key (other settings preserved)."
                );
              }
              console.log("  Authenticated!");
              console.log(
                "  Restart the gateway: openclaw gateway restart\n"
              );
              return;
            }
            if (opts.email) {
              const email = opts.email.trim().toLowerCase();
              const sent = await sendVerificationCode(baseUrl, email);
              if (sent) {
                const nextCmd = `openclaw mem0 init --email ${email} --code <CODE>`;
                if (jsonOut(opts, { ok: true, email, codeSent: true, nextCommand: nextCmd })) return;
                console.log(
                  `Verification code sent! Run:
  ${nextCmd}`
                );
              } else {
                if (jsonErr(opts, `Failed to send verification code to ${email}.`)) return;
              }
              return;
            }
            if (!process.stdin.isTTY) {
              console.log("Usage (non-interactive):");
              console.log("  Platform:");
              console.log("    openclaw mem0 init --api-key <key>");
              console.log("    openclaw mem0 init --api-key <key> --user-id <id>");
              console.log("    openclaw mem0 init --email <email>");
              console.log("    openclaw mem0 init --email <email> --code <c>");
              console.log("  Open Source:");
              console.log("    openclaw mem0 init --mode open-source --oss-llm ollama --oss-embedder ollama --oss-vector qdrant");
              console.log("    openclaw mem0 init --mode open-source --oss-llm openai --oss-llm-key <key>");
              console.log("  Add --json for machine-readable output.");
              return;
            }
            if (hasExistingConfig) {
              console.log("\n  Existing Mem0 configuration found:\n");
              if (existingAuth.apiKey) {
                const masked = existingAuth.apiKey.length > 8 ? existingAuth.apiKey.slice(0, 4) + "..." + existingAuth.apiKey.slice(-4) : existingAuth.apiKey.slice(0, 2) + "***";
                console.log(`    API Key:  ${masked}`);
              }
              if (existingAuth.userId)
                console.log(`    User ID:  ${existingAuth.userId}`);
              if (existingAuth.mode)
                console.log(`    Mode:     ${existingAuth.mode}`);
              console.log("");
              if (existingAuth.apiKey) {
                const check = await validateApiKey(
                  baseUrl,
                  existingAuth.apiKey
                );
                if (check.ok) {
                  console.log(
                    "    Existing API key is valid and connected.\n"
                  );
                } else {
                  console.log(
                    "    Existing API key could not be validated (may be expired or revoked).\n"
                  );
                }
              }
              const reuse = await promptInput(
                "  Keep existing configuration? (y/n): "
              );
              if (reuse === "" || reuse.toLowerCase() === "y" || reuse.toLowerCase() === "yes") {
                console.log(
                  "\n  Configuration preserved. No changes made."
                );
                console.log(
                  "  To update individual settings: openclaw mem0 config set <key> <value>\n"
                );
                return;
              }
              console.log("");
            }
            console.log("\n  Mem0 Setup\n");
            console.log("  How would you like to use Mem0?");
            console.log("  1. Platform (recommended) \u2014 hosted memory, managed by Mem0");
            console.log("  2. Open Source \u2014 self-hosted, choose your own providers\n");
            const modeChoice = await promptInput("  Choice (1/2): ") || "1";
            if (modeChoice === "1") {
              console.log("\n  How would you like to authenticate?");
              console.log("  1. Login with email (recommended)");
              console.log("  2. Enter API key manually\n");
              const authChoice = await promptInput("  Choice (1/2): ") || "1";
              if (authChoice === "1") {
                const email = (await promptInput("  Email: ")).toLowerCase();
                if (!email) {
                  console.error("Email is required.");
                  return;
                }
                const sent = await sendVerificationCode(baseUrl, email);
                if (!sent) return;
                console.log(
                  "  Verification code sent! Check your email.\n"
                );
                const code = await promptInput("  Code: ");
                if (!code) {
                  console.error("Code is required.");
                  return;
                }
                const apiKey = await verifyEmailCode(baseUrl, email, code);
                if (!apiKey) return;
                let userIdValue = opts.userId;
                if (!userIdValue) {
                  const defaultUid = resolveUserId2(void 0, existingAuth.userId);
                  const uidInput = await promptInput(
                    `  User ID: `,
                    defaultUid
                  );
                  userIdValue = uidInput || defaultUid;
                }
                console.log("");
                saveLoginConfig(apiKey, userIdValue, email);
                console.log("  Authenticated!");
                console.log(
                  "  Restart the gateway: openclaw gateway restart\n"
                );
              } else if (authChoice === "2") {
                const key = await promptInput("  API Key: ");
                if (!key) {
                  console.error("API key is required.");
                  return;
                }
                let userIdValue2 = opts.userId;
                if (!userIdValue2) {
                  const defaultUid = resolveUserId2(void 0, existingAuth.userId);
                  const uidInput = await promptInput(
                    `  User ID: `,
                    defaultUid
                  );
                  userIdValue2 = uidInput || defaultUid;
                }
                console.log("");
                const check = await validateApiKey(baseUrl, key);
                saveLoginConfig(key, userIdValue2, check.userEmail);
                if (check.ok) {
                  console.log(
                    "  API key validated. Connected to Mem0 Platform."
                  );
                } else if (check.status) {
                  console.warn(
                    `  API key saved but validation returned HTTP ${check.status}.`
                  );
                } else {
                  console.warn(
                    `  API key saved but could not reach ${baseUrl}: ${check.error}`
                  );
                }
                console.log(
                  "  Restart the gateway: openclaw gateway restart\n"
                );
              } else {
                console.log("Invalid choice. Run `openclaw mem0 init` again.");
              }
            } else if (modeChoice === "2") {
              await runOssWizardInteractive(opts, existingAuth);
            } else {
              console.log("Invalid choice. Run `openclaw mem0 init` again.");
            }
          } catch (err) {
            console.error(`Init failed: ${String(err)}`);
          }
        }
      );
      mem0.command("search").description("Search memories").argument("<query>", "Search query").option("--top-k <n>", "Max results", String(cfg.topK)).option(
        "--scope <scope>",
        'Memory scope: "session", "long-term", or "all"',
        "all"
      ).option("--agent-id <agentId>", "Search agent's memory namespace").option("--user-id <userId>", "Override user ID").option("--json", "Output as JSON").action(
        async (query, opts) => {
          try {
            const limit = parseInt(opts.topK, 10);
            const scope = opts.scope;
            const currentSessionId = getCurrentSessionId();
            const uid = opts.userId ? opts.userId : opts.agentId ? agentUserId2(opts.agentId) : effectiveUserId2(currentSessionId);
            const cliSearchOpts = (userIdOverride, lim, runId) => {
              const base = buildSearchOptions(userIdOverride, lim, runId);
              base.threshold = 0.1;
              return base;
            };
            let allResults = [];
            if (scope === "session" || scope === "all") {
              if (currentSessionId) {
                const sessionResults = await provider.search(
                  query,
                  cliSearchOpts(uid, limit, currentSessionId)
                );
                if (sessionResults?.length) {
                  allResults.push(
                    ...sessionResults.map((r) => ({
                      ...r,
                      _scope: "session"
                    }))
                  );
                }
              } else if (scope === "session") {
                console.log(
                  "No active session ID available for session-scoped search."
                );
                return;
              }
            }
            if (scope === "long-term" || scope === "all") {
              const longTermResults = await provider.search(
                query,
                cliSearchOpts(uid, limit)
              );
              if (longTermResults?.length) {
                allResults.push(
                  ...longTermResults.map((r) => ({
                    ...r,
                    _scope: "long-term"
                  }))
                );
              }
            }
            if (scope === "all") {
              const seen = /* @__PURE__ */ new Set();
              allResults = allResults.filter((r) => {
                if (seen.has(r.id)) return false;
                seen.add(r.id);
                return true;
              });
            }
            if (!allResults.length) {
              if (jsonOut(opts, { ok: true, results: [] })) return;
              console.log("No memories found.");
              return;
            }
            const output = allResults.map((r) => ({
              id: r.id,
              memory: r.memory,
              score: r.score,
              scope: r._scope,
              categories: r.categories,
              created_at: r.created_at
            }));
            if (jsonOut(opts, { ok: true, results: output })) return;
            console.log(JSON.stringify(output, null, 2));
          } catch (err) {
            if (jsonErr(opts, `Search failed: ${String(err)}`)) return;
            console.error(`Search failed: ${String(err)}`);
          }
        }
      );
      mem0.command("add").description("Add a memory from text").argument("<text>", "Text to store as a memory").option("--user-id <userId>", "Override user ID").option("--agent-id <agentId>", "Store in agent's memory namespace").option("--json", "Output as JSON").action(
        async (text, opts) => {
          try {
            const uid = opts.userId ? opts.userId : opts.agentId ? agentUserId2(opts.agentId) : effectiveUserId2(getCurrentSessionId());
            const result = await provider.add(
              [{ role: "user", content: text }],
              { user_id: uid, source: "OPENCLAW" }
            );
            const count = result.results?.length ?? 0;
            if (jsonOut(opts, { ok: true, memories: (result.results || []).map((r) => ({ id: r.id, memory: r.memory, event: r.event })) })) return;
            if (count > 0) {
              console.log(`Added ${count} memory(s):`);
              for (const r of result.results) {
                console.log(`  ${r.id}: ${r.memory} [${r.event}]`);
              }
            } else {
              console.log(
                "No new memories extracted (text may already be stored or not contain durable facts)."
              );
            }
          } catch (err) {
            if (jsonErr(opts, `Add failed: ${String(err)}`)) return;
            console.error(`Add failed: ${String(err)}`);
          }
        }
      );
      mem0.command("get").description("Get a specific memory by ID").argument("<memory_id>", "Memory ID to retrieve").option("--json", "Output as JSON").action(async (memoryId, opts = {}) => {
        try {
          const memory = await provider.get(memoryId);
          if (jsonOut(opts, { ok: true, memory: { id: memory.id, memory: memory.memory, user_id: memory.user_id, categories: memory.categories, metadata: memory.metadata, created_at: memory.created_at, updated_at: memory.updated_at } })) return;
          console.log(
            JSON.stringify(
              {
                id: memory.id,
                memory: memory.memory,
                user_id: memory.user_id,
                categories: memory.categories,
                metadata: memory.metadata,
                created_at: memory.created_at,
                updated_at: memory.updated_at
              },
              null,
              2
            )
          );
        } catch (err) {
          if (jsonErr(opts, `Get failed: ${String(err)}`)) return;
          console.error(`Get failed: ${String(err)}`);
        }
      });
      mem0.command("list").description("List memories with optional filters").option("--user-id <userId>", "Override user ID").option("--agent-id <agentId>", "List agent's memories").option("--top-k <n>", "Max results", "50").option("--json", "Output as JSON").action(
        async (opts) => {
          try {
            const uid = opts.userId ? opts.userId : opts.agentId ? agentUserId2(opts.agentId) : cfg.userId;
            const limit = parseInt(opts.topK, 10);
            const memories = await provider.getAll({
              user_id: uid,
              page_size: limit,
              source: "OPENCLAW"
            });
            if (!Array.isArray(memories) || memories.length === 0) {
              if (jsonOut(opts, { ok: true, memories: [], count: 0 })) return;
              console.log("No memories found.");
              return;
            }
            const output = memories.map((m) => ({
              id: m.id,
              memory: m.memory,
              categories: m.categories,
              created_at: m.created_at,
              updated_at: m.updated_at
            }));
            if (jsonOut(opts, { ok: true, memories: output, count: memories.length })) return;
            console.log(JSON.stringify(output, null, 2));
            console.log(`
Total: ${memories.length} memories`);
          } catch (err) {
            if (jsonErr(opts, `List failed: ${String(err)}`)) return;
            console.error(`List failed: ${String(err)}`);
          }
        }
      );
      mem0.command("update").description("Update a memory's text").argument("<memory_id>", "Memory ID to update").argument("<text>", "New text for the memory").option("--json", "Output as JSON").action(async (memoryId, text, opts = {}) => {
        try {
          await provider.update(memoryId, text);
          if (jsonOut(opts, { ok: true, memory: { id: memoryId, memory: text } })) return;
          console.log(`Memory ${memoryId} updated.`);
        } catch (err) {
          if (jsonErr(opts, `Update failed: ${String(err)}`)) return;
          console.error(`Update failed: ${String(err)}`);
        }
      });
      mem0.command("delete").description("Delete a memory, or all memories for a user").argument("[memory_id]", "Memory ID to delete").option("--all", "Delete all memories for the user").option("--user-id <userId>", "Override user ID (with --all)").option("--agent-id <agentId>", "Delete from agent's namespace").option("--confirm", "Skip confirmation for bulk delete").option("--json", "Output as JSON").action(
        async (memoryId, opts) => {
          try {
            if (opts.all) {
              const uid = opts.userId ? opts.userId : opts.agentId ? agentUserId2(opts.agentId) : cfg.userId;
              if (!opts.confirm && process.stdin.isTTY) {
                const answer = await promptInput(
                  `  Delete ALL memories for user "${uid}"? This cannot be undone. (yes/N): `
                );
                if (answer.toLowerCase() !== "yes") {
                  console.log("Cancelled.");
                  return;
                }
              } else if (!opts.confirm) {
                console.error(
                  "Bulk delete requires --confirm flag in non-interactive mode."
                );
                return;
              }
              await provider.deleteAll(uid);
              if (jsonOut(opts, { ok: true, deleted: true, id: "all", userId: uid })) return;
              console.log(`All memories deleted for user "${uid}".`);
              return;
            }
            if (!memoryId) {
              if (jsonErr(opts, "Provide a memory_id or use --all to delete all memories.")) return;
              console.error(
                "Provide a memory_id or use --all to delete all memories."
              );
              return;
            }
            await provider.delete(memoryId);
            if (jsonOut(opts, { ok: true, deleted: true, id: memoryId })) return;
            console.log(`Memory ${memoryId} deleted.`);
          } catch (err) {
            if (jsonErr(opts, `Delete failed: ${String(err)}`)) return;
            console.error(`Delete failed: ${String(err)}`);
          }
        }
      );
      mem0.command("status").description("Check API connectivity and current config").option("--json", "Output as JSON").action(async (opts = {}) => {
        try {
          if (cfg.needsSetup || !backend) {
            const error = "Mem0 is not configured. Run `openclaw mem0 init`.";
            if (jsonOut(opts, {
              ok: true,
              mode: cfg.mode,
              connected: false,
              userId: cfg.userId,
              error
            })) return;
            console.log(error);
            return;
          }
          const result = await backend.status();
          if (jsonOut(opts, {
            ok: true,
            mode: cfg.mode,
            connected: result.connected,
            userId: cfg.userId,
            ...result.url && { url: result.url },
            ...result.error && { error: String(result.error) }
          })) return;
          console.log(`Mode: ${cfg.mode}`);
          console.log(`User ID: ${cfg.userId}`);
          console.log(`Config: ${OPENCLAW_CONFIG_FILE}`);
          console.log("");
          if (result.connected) {
            console.log("Connected to Mem0");
          } else {
            console.log("Not connected to Mem0");
          }
          if (result.url) {
            console.log(`URL: ${String(result.url)}`);
          }
          if (result.error) {
            console.log(`Error: ${String(result.error)}`);
          }
        } catch (err) {
          if (jsonErr(opts, `Status check failed: ${String(err)}`)) return;
          console.error(`Status check failed: ${String(err)}`);
        }
      });
      const configCmd = mem0.command("config").description("Manage plugin configuration");
      const CONFIG_KEYS = {
        // Short aliases (matches Python CLI)
        api_key: "apiKey",
        email: "userEmail",
        base_url: "baseUrl",
        user_id: "userId",
        auto_recall: "autoRecall",
        auto_capture: "autoCapture",
        top_k: "topK",
        mode: "mode",
        embedder_provider: "oss.embedder.provider",
        embedder_model: "oss.embedder.config.model",
        embedder_key: "oss.embedder.config.apiKey",
        llm_provider: "oss.llm.provider",
        llm_model: "oss.llm.config.model",
        llm_key: "oss.llm.config.apiKey",
        vector_provider: "oss.vectorStore.provider",
        vector_host: "oss.vectorStore.config.host",
        vector_port: "oss.vectorStore.config.port",
        collection_name: "oss.vectorStore.config.collectionName",
        vector_db_name: "oss.vectorStore.config.dbname",
        vector_db_user: "oss.vectorStore.config.user",
        vector_db_path: "oss.vectorStore.config.dbPath",
        history_db_path: "oss.historyDbPath",
        disable_history: "oss.disableHistory"
      };
      const SECRET_KEYS = /* @__PURE__ */ new Set(["apiKey", "oss.embedder.config.apiKey", "oss.llm.config.apiKey"]);
      const BOOLEAN_KEYS = /* @__PURE__ */ new Set([
        "autoRecall",
        "autoCapture",
        "oss.disableHistory"
      ]);
      const INTEGER_KEYS = /* @__PURE__ */ new Set(["topK", "oss.vectorStore.config.port"]);
      function resolveConfigKey(key) {
        return CONFIG_KEYS[key] ?? null;
      }
      function getConfigValue(field) {
        if (field.startsWith("oss.")) {
          const parts = field.split(".");
          let current = cfg.oss;
          for (let i = 1; i < parts.length && current != null; i++) {
            current = current[parts[i]];
          }
          return current;
        }
        const auth = readPluginAuth();
        const values = {
          apiKey: auth.apiKey ?? cfg.apiKey,
          baseUrl: auth.baseUrl ?? cfg.baseUrl ?? metamemAuthOrigin(),
          userId: auth.userId ?? cfg.userId,
          mode: auth.mode ?? cfg.mode,
          userEmail: auth.userEmail,
          autoRecall: cfg.autoRecall,
          autoCapture: cfg.autoCapture,
          topK: cfg.topK
        };
        return values[field];
      }
      function displayValue(field, value) {
        if (value === void 0 || value === null || value === "") {
          return "(not set)";
        }
        if (SECRET_KEYS.has(field) && typeof value === "string") {
          const redacted = redactSecrets2({ v: value }, /* @__PURE__ */ new Set(["v"]));
          return redacted.v;
        }
        return String(value);
      }
      configCmd.command("show").description("Show current configuration").option("--json", "Output as JSON").action((opts = {}) => {
        if (opts.json) {
          const showEntries = [
            ["mode", "mode"],
            ["user_id", "userId"],
            ["auto_recall", "autoRecall"],
            ["auto_capture", "autoCapture"],
            ["top_k", "topK"]
          ];
          if (cfg.mode === "platform") {
            showEntries.push(["api_key", "apiKey"], ["email", "userEmail"]);
          } else {
            showEntries.push(
              ["embedder_provider", "oss.embedder.provider"],
              ["embedder_model", "oss.embedder.config.model"],
              ["embedder_key", "oss.embedder.config.apiKey"],
              ["llm_provider", "oss.llm.provider"],
              ["llm_model", "oss.llm.config.model"],
              ["llm_key", "oss.llm.config.apiKey"],
              ["vector_provider", "oss.vectorStore.provider"],
              ["history_db_path", "oss.historyDbPath"],
              ["disable_history", "oss.disableHistory"]
            );
          }
          const configObj = {};
          for (const [displayKey, field] of showEntries) {
            const val = getConfigValue(field);
            configObj[displayKey] = SECRET_KEYS.has(field) && typeof val === "string" ? redactSecrets2({ v: val }, /* @__PURE__ */ new Set(["v"])).v : val;
          }
          jsonOut(opts, { ok: true, config: configObj });
          return;
        }
        const entries = [
          ["mode", "mode"],
          ["user_id", "userId"],
          ["auto_recall", "autoRecall"],
          ["auto_capture", "autoCapture"],
          ["top_k", "topK"]
        ];
        if (cfg.mode === "platform") {
          entries.push(
            ["api_key", "apiKey"],
            ["email", "userEmail"]
          );
        } else {
          entries.push(
            ["embedder_provider", "oss.embedder.provider"],
            ["embedder_model", "oss.embedder.config.model"],
            ["embedder_key", "oss.embedder.config.apiKey"],
            ["llm_provider", "oss.llm.provider"],
            ["llm_model", "oss.llm.config.model"],
            ["llm_key", "oss.llm.config.apiKey"],
            ["vector_provider", "oss.vectorStore.provider"],
            ["history_db_path", "oss.historyDbPath"],
            ["disable_history", "oss.disableHistory"]
          );
        }
        const maxKeyLen = Math.max(
          ...entries.map(([k]) => k.length),
          3
        );
        console.log("");
        console.log(
          `  ${"Key".padEnd(maxKeyLen)}   Value`
        );
        console.log(
          `  ${"\u2500".repeat(maxKeyLen)}   ${"\u2500".repeat(30)}`
        );
        for (const [displayKey, field] of entries) {
          const value = getConfigValue(field);
          const display = displayValue(field, value);
          console.log(
            `  ${displayKey.padEnd(maxKeyLen)}   ${display}`
          );
        }
        console.log("");
        console.log(`  Config file: ${OPENCLAW_CONFIG_FILE}`);
        console.log("");
        console.log("  To change a setting:");
        console.log("    openclaw mem0 config set <key> <value>");
        console.log("");
        console.log("  Examples:");
        if (cfg.mode === "platform") {
          console.log("    openclaw mem0 config set mode open-source");
          console.log("    openclaw mem0 config set auto_recall false");
        } else {
          console.log("    openclaw mem0 config set vector_provider qdrant");
          console.log("    openclaw mem0 config set llm_model gpt-5-mini");
          console.log("    openclaw mem0 config set embedder_provider openai");
        }
        console.log("");
      });
      configCmd.command("get").description("Get a config value").argument("<key>", "Config key (e.g. user_id, api_key, llm_model)").option("--json", "Output as JSON").action((key, opts = {}) => {
        const field = resolveConfigKey(key);
        if (!field) {
          if (jsonErr(opts, `Unknown config key: ${key}`)) return;
          console.error(
            `Unknown config key: ${key}`
          );
          return;
        }
        const value = getConfigValue(field);
        if (jsonOut(opts, { ok: true, key, value })) return;
        console.log(displayValue(field, value));
      });
      configCmd.command("set").description("Set a config value").argument("<key>", "Config key (e.g. user_id, api_key, llm_model)").argument("<value>", "New value").option("--json", "Output as JSON").action((key, rawValue, opts = {}) => {
        const field = resolveConfigKey(key);
        if (!field) {
          if (jsonErr(opts, `Unknown config key: ${key}`)) return;
          console.error(
            `Unknown config key: ${key}`
          );
          return;
        }
        let value = rawValue;
        if (BOOLEAN_KEYS.has(field)) {
          value = rawValue.toLowerCase() === "true" || rawValue === "1" || rawValue.toLowerCase() === "yes";
        } else if (INTEGER_KEYS.has(field)) {
          const parsed = parseInt(rawValue, 10);
          if (isNaN(parsed)) {
            if (jsonErr(opts, `Invalid integer value: ${rawValue}`)) return;
            console.error(`Invalid integer value: ${rawValue}`);
            return;
          }
          value = parsed;
        }
        if (field.startsWith("oss.")) {
          writePluginConfigField(field.split("."), value);
        } else {
          writePluginAuth({ [field]: value });
        }
        if (jsonOut(opts, { ok: true, key, value })) return;
        console.log(
          `${key} = ${displayValue(field, value)}`
        );
      });
      mem0.command("import").description("Import memories from a JSON file").argument("<file>", "Path to JSON file containing memories").option("--user-id <userId>", "Override user ID for all imported memories").option("--agent-id <agentId>", "Override agent ID for all imported memories").option("--json", "Output as JSON").action(
        async (file, opts) => {
          try {
            let data;
            try {
              data = JSON.parse(readText(file));
            } catch (err) {
              console.error(`Failed to read file: ${String(err)}`);
              return;
            }
            const items = Array.isArray(data) ? data : [data];
            let added = 0;
            let failed = 0;
            for (const item of items) {
              const content = item?.memory ?? item?.text ?? item?.content ?? "";
              if (!content) {
                failed++;
                continue;
              }
              try {
                await backend.add(content, void 0, {
                  userId: opts.userId ?? item?.user_id ?? cfg.userId,
                  agentId: opts.agentId ?? item?.agent_id,
                  metadata: item?.metadata
                });
                added++;
              } catch {
                failed++;
              }
            }
            if (jsonOut(opts, { ok: true, imported: added, failed, total: items.length })) return;
            console.log(`Imported ${added} memories.`);
            if (failed) {
              console.error(`${failed} memories failed to import.`);
            }
          } catch (err) {
            if (jsonErr(opts, `Import failed: ${String(err)}`)) return;
            console.error(`Import failed: ${String(err)}`);
          }
        }
      );
      const eventCmd = mem0.command("event").description("Manage background processing events");
      eventCmd.command("list").description("List recent background events").option("--json", "Output as JSON").action(async (opts = {}) => {
        try {
          if (!backend || cfg.mode === "open-source") {
            console.log("Event tracking is only available in platform mode.");
            return;
          }
          const results = await backend.listEvents();
          if (!results.length) {
            console.log("No events found.");
            return;
          }
          if (jsonOut(opts, { ok: true, events: results })) return;
          const header = [
            "Event ID".padEnd(36),
            "Type".padEnd(14),
            "Status".padEnd(12),
            "Latency".padStart(10),
            "Created".padEnd(20)
          ].join("  ");
          console.log(header);
          console.log("-".repeat(header.length));
          for (const ev of results) {
            const evId = String(ev.id ?? "");
            const evType = String(ev.event_type ?? "\u2014").padEnd(14);
            const status = String(ev.status ?? "\u2014").padEnd(12);
            const latency = typeof ev.latency === "number" ? `${Math.round(ev.latency)}ms` : "\u2014";
            const created = String(ev.created_at ?? "\u2014").slice(0, 19).replace("T", " ");
            console.log(
              `${evId.padEnd(36)}  ${evType}  ${status}  ${latency.padStart(10)}  ${created}`
            );
          }
          console.log(`
${results.length} event${results.length !== 1 ? "s" : ""}`);
        } catch (err) {
          if (jsonErr(opts, `Failed to list events: ${String(err)}`)) return;
          console.error(`Failed to list events: ${String(err)}`);
        }
      });
      eventCmd.command("status").description("Get status of a specific background event").argument("<event_id>", "Event ID to check").option("--json", "Output as JSON").action(async (eventId, opts = {}) => {
        try {
          if (!backend || cfg.mode === "open-source") {
            console.log("Event tracking is only available in platform mode.");
            return;
          }
          const ev = await backend.getEvent(eventId);
          if (jsonOut(opts, { ok: true, event: ev })) return;
          const status = String(ev.status ?? "\u2014");
          const evType = String(ev.event_type ?? "\u2014");
          const latency = typeof ev.latency === "number" ? `${Math.round(ev.latency)}ms` : "\u2014";
          const created = String(ev.created_at ?? "\u2014").slice(0, 19).replace("T", " ");
          const updated = String(ev.updated_at ?? "\u2014").slice(0, 19).replace("T", " ");
          console.log(`Event ID:  ${eventId}`);
          console.log(`Type:      ${evType}`);
          console.log(`Status:    ${status}`);
          console.log(`Latency:   ${latency}`);
          console.log(`Created:   ${created}`);
          console.log(`Updated:   ${updated}`);
          const results = ev.results;
          if (results && Array.isArray(results) && results.length) {
            console.log(`
Results (${results.length}):`);
            for (const r of results) {
              const memId = String(r.id ?? "").slice(0, 8);
              const data = r.data;
              const memory = data?.memory ?? "";
              const evName = String(r.event ?? "");
              const user = String(r.user_id ?? "");
              let detail = `${evName}  ${memory}`;
              if (user) detail += `  (user_id=${user})`;
              console.log(`  \xB7 ${detail}  (${memId})`);
            }
          }
        } catch (err) {
          if (jsonErr(opts, `Failed to get event: ${String(err)}`)) return;
          console.error(`Failed to get event: ${String(err)}`);
        }
      });
      mem0.command("help").description("Show help. Use --json for machine-readable output (for LLM agents)").option("--json", "Output as JSON for agent/programmatic use").action((opts) => {
        const commands = {
          memory: {
            search: "Query your memory store \u2014 semantic, keyword, or hybrid retrieval",
            add: "Add a memory from text, messages, or stdin",
            get: "Get a specific memory by ID",
            list: "List memories with optional filters",
            update: "Update a memory's text or metadata",
            delete: "Delete a memory, all memories, or an entity",
            import: "Import memories from a JSON file"
          },
          management: {
            init: "Interactive setup wizard for mem0 CLI",
            status: "Check connectivity and authentication",
            config: "Manage mem0 configuration (show, get, set)",
            event: "Manage background processing events (list, status)",
            help: "Show help. Use --json for machine-readable output (for LLM agents)"
          }
        };
        if (opts.json) {
          const detailed = {
            commands: {
              memory: {
                search: { description: "Query your memory store", flags: { "--top-k <n>": "Max results", "--scope <scope>": "Memory scope", "--user-id <id>": "Override user ID", "--agent-id <id>": "Agent namespace", "--json": "JSON output" } },
                add: { description: "Add a memory from text", flags: { "--user-id <id>": "Override user ID", "--agent-id <id>": "Agent namespace", "--json": "JSON output" } },
                get: { description: "Get a specific memory by ID", flags: { "--json": "JSON output" } },
                list: { description: "List memories", flags: { "--user-id <id>": "Override user ID", "--top-k <n>": "Max results", "--json": "JSON output" } },
                update: { description: "Update a memory's text", flags: { "--json": "JSON output" } },
                delete: { description: "Delete a memory or all memories", flags: { "--all": "Delete all", "--confirm": "Skip confirmation", "--json": "JSON output" } },
                import: { description: "Import memories from JSON file", flags: { "--user-id <id>": "Override user ID", "--json": "JSON output" } }
              },
              management: {
                init: { description: "Set up Mem0", flags: { "--mode <m>": "platform or open-source", "--api-key <k>": "API key", "--email <e>": "Email login", "--oss-llm <p>": "LLM provider", "--oss-embedder <p>": "Embedder", "--oss-vector <p>": "Vector store", "--json": "JSON output" } },
                status: { description: "Check connectivity", flags: { "--json": "JSON output" } },
                config: { description: "Manage configuration (show, get, set)", flags: { "--json": "JSON output" } },
                event: { description: "Manage background events (list, status)", flags: { "--json": "JSON output" } },
                help: { description: "Show help", flags: { "--json": "JSON output" } }
              }
            }
          };
          process.stdout.write(JSON.stringify(detailed, null, 2) + "\n");
          return;
        }
        console.log("");
        console.log("  openclaw mem0 <command>");
        console.log("");
        console.log("  Memory:");
        for (const [cmd, desc] of Object.entries(commands.memory)) {
          console.log(`    ${cmd.padEnd(12)} ${desc}`);
        }
        console.log("");
        console.log("  Management:");
        for (const [cmd, desc] of Object.entries(commands.management)) {
          console.log(`    ${cmd.padEnd(12)} ${desc}`);
        }
        console.log("");
      });
    },
    {
      descriptors: [
        { name: "mem0", description: "Mem0 memory plugin commands", hasSubcommands: true }
      ]
    }
  );
}

// tools/memory-search.ts
import { Type } from "@sinclair/typebox";
function createMemorySearchTool(deps) {
  const { cfg, provider, resolveUserId: resolveUserId3, buildSearchOptions, getCurrentSessionId } = deps;
  return {
    name: "memory_search",
    label: "Memory Search",
    description: USER_SEARCH_TOOL_DESCRIPTION,
    parameters: Type.Object({
      query: Type.String({ description: USER_SEARCH_QUERY_DESCRIPTION }),
      limit: Type.Optional(Type.Number({ description: `Max results (default: ${cfg.topK})` })),
      userId: Type.Optional(Type.String({ description: "User ID to scope search" })),
      agentId: Type.Optional(Type.String({ description: "Agent ID to search a specific agent's memories" })),
      scope: Type.Optional(
        Type.Union([Type.Literal("session"), Type.Literal("long-term"), Type.Literal("all")], {
          description: 'Scope: "all" (default), "session", or "long-term"'
        })
      ),
      categories: Type.Optional(Type.Array(Type.String(), { description: "Filter by category" })),
      filters: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Advanced filters" }))
    }),
    async execute(_toolCallId, params) {
      const {
        query,
        limit,
        userId,
        agentId,
        scope = "all",
        categories: filterCategories,
        filters: agentFilters
      } = params;
      const start = Date.now();
      try {
        let results = [];
        const uid = resolveUserId3({ agentId, userId });
        const currentSessionId = getCurrentSessionId();
        const applyFilters = (opts) => {
          if (filterCategories?.length) opts.categories = filterCategories;
          if (agentFilters) opts.filters = agentFilters;
          return opts;
        };
        if (scope === "session") {
          if (currentSessionId) {
            results = await provider.search(query, applyFilters(buildSearchOptions(uid, limit, void 0, currentSessionId)));
          }
        } else if (scope === "long-term") {
          results = await provider.search(query, applyFilters(buildSearchOptions(uid, limit)));
        } else {
          const longTerm = await provider.search(query, applyFilters(buildSearchOptions(uid, limit)));
          let session = [];
          if (currentSessionId) {
            session = await provider.search(query, applyFilters(buildSearchOptions(uid, limit, void 0, currentSessionId)));
          }
          const seen = new Set(longTerm.map((r) => r.id));
          results = [...longTerm, ...session.filter((r) => !seen.has(r.id))];
        }
        deps.captureToolEvent("memory_search", { success: true, latency_ms: Date.now() - start, result_count: results.length });
        if (!results || results.length === 0) {
          return { content: [{ type: "text", text: "No relevant memories found." }], details: { count: 0 } };
        }
        const text = results.map(
          (r, i) => `${i + 1}. ${r.memory} (score: ${((r.score ?? 0) * 100).toFixed(0)}%, id: ${r.id})`
        ).join("\n");
        return {
          content: [{ type: "text", text: `Found ${results.length} memories:

${text}` }],
          details: {
            count: results.length,
            memories: results.map((r) => ({ id: r.id, memory: r.memory, score: r.score, categories: r.categories, created_at: r.created_at }))
          }
        };
      } catch (err) {
        deps.captureToolEvent("memory_search", { success: false, latency_ms: Date.now() - start, error: String(err) });
        return { content: [{ type: "text", text: `Memory search failed: ${String(err)}` }], details: { error: String(err) } };
      }
    }
  };
}

// tools/memory-add.ts
import { Type as Type2 } from "@sinclair/typebox";
function createMemoryAddTool(deps) {
  const { api, provider, resolveUserId: resolveUserId3, getCurrentSessionId, buildAddOptions, buildSearchOptions, skillsActive } = deps;
  return {
    name: "memory_add",
    label: "Memory Add",
    description: "Save important information to long-term memory via Mem0. Do this proactively, without being asked, whenever the user shares a preference, fact, decision, rule, or anything worth recalling in future sessions. Group related facts under one category.",
    parameters: Type2.Object({
      text: Type2.Optional(Type2.String({ description: "Single fact to remember" })),
      facts: Type2.Optional(Type2.Array(Type2.String(), { description: "Array of facts to store. ALL must share the same category." })),
      category: Type2.Optional(Type2.String({ description: 'Category: "identity", "preference", "decision", "rule", "project", "configuration", "technical", "relationship"' })),
      importance: Type2.Optional(Type2.Number({ description: "Importance (0.0-1.0), omit for category default" })),
      userId: Type2.Optional(Type2.String({ description: "User ID to scope this memory" })),
      agentId: Type2.Optional(Type2.String({ description: "Agent ID namespace" })),
      metadata: Type2.Optional(Type2.Record(Type2.String(), Type2.Unknown(), { description: "Additional metadata" })),
      longTerm: Type2.Optional(Type2.Boolean({ description: "Long-term (default: true). Set false for session-scoped." }))
    }),
    async execute(_toolCallId, params) {
      const p = params;
      const rawFacts = p.facts?.length ? p.facts : p.text ? [p.text] : [];
      if (rawFacts.length === 0) {
        return { content: [{ type: "text", text: "No facts provided. Pass 'text' or 'facts' array." }], details: { error: "missing_facts" } };
      }
      const allFacts = rawFacts.map((f) => stripNoiseFromContent(f)).filter((f) => f.length > 0 && !isNoiseMessage(f));
      if (allFacts.length === 0) {
        return { content: [{ type: "text", text: "All provided facts were filtered as noise. Nothing stored." }], details: { error: "all_noise" } };
      }
      const start = Date.now();
      try {
        const currentSessionId = getCurrentSessionId();
        if (isSubagentSession(currentSessionId)) {
          return { content: [{ type: "text", text: "Memory storage is not available in subagent sessions." }], details: { error: "subagent_blocked" } };
        }
        const uid = resolveUserId3({ agentId: p.agentId, userId: p.userId });
        const runId = !(p.longTerm ?? true) && currentSessionId ? currentSessionId : void 0;
        if (skillsActive) {
          const rawMetadata = p.metadata;
          const category = p.category ?? rawMetadata?.category;
          const importance = p.importance ?? rawMetadata?.importance;
          const parsedMetadata = {
            ...rawMetadata ?? {},
            ...category && { category },
            ...importance !== void 0 && { importance }
          };
          const addOpts = {
            user_id: uid,
            source: "OPENCLAW",
            infer: false,
            deduced_memories: allFacts,
            metadata: parsedMetadata ?? {}
          };
          if (runId) addOpts.run_id = runId;
          const result2 = await provider.add([{ role: "user", content: allFacts.join("\n") }], addOpts);
          const count = result2.results?.length ?? 0;
          api.logger.info(`openclaw-mem0: stored ${count} memor${count === 1 ? "y" : "ies"} (infer=false, category=${category ?? "none"})`);
          deps.captureToolEvent("memory_add", { success: true, latency_ms: Date.now() - start, fact_count: allFacts.length, mode: "skills" });
          return {
            content: [{ type: "text", text: `Stored ${allFacts.length} fact(s) [${category ?? "uncategorized"}]: ${allFacts.map((f) => `"${f.slice(0, 60)}${f.length > 60 ? "..." : ""}"`).join(", ")}` }],
            details: { action: "stored", mode: "skills", category, factCount: allFacts.length, results: result2.results }
          };
        }
        const combinedText = allFacts.join("\n");
        const result = await provider.add([{ role: "user", content: combinedText }], buildAddOptions(uid, runId, currentSessionId));
        const added = result.results?.filter((r) => r.event === "ADD") ?? [];
        const updated = result.results?.filter((r) => r.event === "UPDATE") ?? [];
        const summary = [];
        if (added.length > 0) summary.push(`${added.length} added`);
        if (updated.length > 0) summary.push(`${updated.length} updated`);
        if (summary.length === 0) summary.push("No new memories extracted");
        deps.captureToolEvent("memory_add", { success: true, latency_ms: Date.now() - start, fact_count: allFacts.length });
        return {
          content: [{ type: "text", text: `Stored: ${summary.join(", ")}. ${result.results?.map((r) => `[${r.event}] ${r.memory}`).join("; ") ?? ""}` }],
          details: { action: "stored", results: result.results }
        };
      } catch (err) {
        deps.captureToolEvent("memory_add", { success: false, latency_ms: Date.now() - start, error: String(err) });
        return { content: [{ type: "text", text: `Memory add failed: ${String(err)}` }], details: { error: String(err) } };
      }
    }
  };
}

// tools/memory-get.ts
import { Type as Type3 } from "@sinclair/typebox";
function createMemoryGetTool(deps) {
  const { provider } = deps;
  return {
    name: "memory_get",
    label: "Memory Get",
    description: "Fetch one memory by its exact ID (e.g. an ID returned by memory_search or memory_list) to read its full content and metadata.",
    parameters: Type3.Object({
      memoryId: Type3.String({ description: "The memory ID to retrieve" })
    }),
    async execute(_toolCallId, params) {
      const { memoryId } = params;
      const start = Date.now();
      try {
        const memory = await provider.get(memoryId);
        deps.captureToolEvent("memory_get", { success: true, latency_ms: Date.now() - start });
        return {
          content: [{ type: "text", text: `Memory ${memory.id}:
${memory.memory}

Created: ${memory.created_at ?? "unknown"}
Updated: ${memory.updated_at ?? "unknown"}` }],
          details: { memory }
        };
      } catch (err) {
        deps.captureToolEvent("memory_get", { success: false, latency_ms: Date.now() - start, error: String(err) });
        return { content: [{ type: "text", text: `Memory get failed: ${String(err)}` }], details: { error: String(err) } };
      }
    }
  };
}

// tools/memory-list.ts
import { Type as Type4 } from "@sinclair/typebox";
function createMemoryListTool(deps) {
  const { provider, resolveUserId: resolveUserId3, getCurrentSessionId } = deps;
  return {
    name: "memory_list",
    label: "Memory List",
    description: "List or browse all stored memories for a user or agent without a query -- useful for auditing what is remembered. To find memories relevant to a question, use memory_search instead (it ranks by semantic relevance).",
    parameters: Type4.Object({
      userId: Type4.Optional(Type4.String({ description: "User ID (default: configured)" })),
      agentId: Type4.Optional(Type4.String({ description: "Agent ID namespace" })),
      scope: Type4.Optional(
        Type4.Union([Type4.Literal("session"), Type4.Literal("long-term"), Type4.Literal("all")], {
          description: 'Scope: "all" (default), "session", or "long-term"'
        })
      )
    }),
    async execute(_toolCallId, params) {
      const { userId, agentId, scope = "all" } = params;
      const start = Date.now();
      try {
        let memories = [];
        const uid = resolveUserId3({ agentId, userId });
        const currentSessionId = getCurrentSessionId();
        if (scope === "session") {
          if (currentSessionId) memories = await provider.getAll({ user_id: uid, run_id: currentSessionId, source: "OPENCLAW" });
        } else if (scope === "long-term") {
          memories = await provider.getAll({ user_id: uid, source: "OPENCLAW" });
        } else {
          const longTerm = await provider.getAll({ user_id: uid, source: "OPENCLAW" });
          let session = [];
          if (currentSessionId) session = await provider.getAll({ user_id: uid, run_id: currentSessionId, source: "OPENCLAW" });
          const seen = new Set(longTerm.map((r) => r.id));
          memories = [...longTerm, ...session.filter((r) => !seen.has(r.id))];
        }
        deps.captureToolEvent("memory_list", { success: true, latency_ms: Date.now() - start, result_count: memories.length });
        if (!memories || memories.length === 0) {
          return { content: [{ type: "text", text: "No memories stored yet." }], details: { count: 0 } };
        }
        const text = memories.map((r, i) => `${i + 1}. ${r.memory} (id: ${r.id})`).join("\n");
        return {
          content: [{ type: "text", text: `${memories.length} memories:

${text}` }],
          details: {
            count: memories.length,
            memories: memories.map((r) => ({ id: r.id, memory: r.memory, categories: r.categories, created_at: r.created_at }))
          }
        };
      } catch (err) {
        deps.captureToolEvent("memory_list", { success: false, latency_ms: Date.now() - start, error: String(err) });
        return { content: [{ type: "text", text: `Memory list failed: ${String(err)}` }], details: { error: String(err) } };
      }
    }
  };
}

// tools/memory-update.ts
import { Type as Type5 } from "@sinclair/typebox";
function createMemoryUpdateTool(deps) {
  const { api, provider, getCurrentSessionId } = deps;
  return {
    name: "memory_update",
    label: "Memory Update",
    description: "Update an existing memory's text in place when a stored fact has changed -- requires the memory ID. Atomic and preserves the ID and history, so prefer this over deleting and re-adding.",
    parameters: Type5.Object({
      memoryId: Type5.String({ description: "The memory ID to update" }),
      text: Type5.String({ description: "The new text (replaces old)" })
    }),
    async execute(_toolCallId, params) {
      const { memoryId, text } = params;
      const start = Date.now();
      try {
        if (isSubagentSession(getCurrentSessionId())) {
          return { content: [{ type: "text", text: "Memory update is not available in subagent sessions." }], details: { error: "subagent_blocked" } };
        }
        await provider.update(memoryId, text);
        deps.captureToolEvent("memory_update", { success: true, latency_ms: Date.now() - start });
        return {
          content: [{ type: "text", text: `Updated memory ${memoryId}: "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"` }],
          details: { action: "updated", id: memoryId }
        };
      } catch (err) {
        deps.captureToolEvent("memory_update", { success: false, latency_ms: Date.now() - start, error: String(err) });
        return { content: [{ type: "text", text: `Memory update failed: ${String(err)}` }], details: { error: String(err) } };
      }
    }
  };
}

// tools/memory-delete.ts
import { Type as Type6 } from "@sinclair/typebox";
function createMemoryDeleteTool(deps) {
  const { api, provider, resolveUserId: resolveUserId3, getCurrentSessionId, buildSearchOptions } = deps;
  return {
    name: "memory_delete",
    label: "Memory Delete",
    description: "Delete memories that are wrong, obsolete, or that the user asks to forget. Provide memoryId, a query to search-and-delete, or all:true for bulk deletion (requires confirm:true). Irreversible -- never delete speculatively or wipe everything without an explicit request.",
    parameters: Type6.Object({
      memoryId: Type6.Optional(Type6.String({ description: "Specific memory ID to delete" })),
      query: Type6.Optional(Type6.String({ description: "Search query to find and delete" })),
      agentId: Type6.Optional(Type6.String({ description: "Agent ID to scope deletion" })),
      all: Type6.Optional(Type6.Boolean({ description: "Delete ALL memories. Requires confirm: true." })),
      confirm: Type6.Optional(Type6.Boolean({ description: "Safety gate for bulk operations" })),
      userId: Type6.Optional(Type6.String({ description: "User ID scope" }))
    }),
    async execute(_toolCallId, params) {
      const { memoryId, query, agentId, all, confirm, userId } = params;
      const start = Date.now();
      try {
        if (isSubagentSession(getCurrentSessionId())) {
          return { content: [{ type: "text", text: "Memory deletion is not available in subagent sessions." }], details: { error: "subagent_blocked" } };
        }
        if (memoryId) {
          await provider.delete(memoryId);
          deps.captureToolEvent("memory_delete", { success: true, latency_ms: Date.now() - start, delete_mode: "single" });
          return { content: [{ type: "text", text: `Memory ${memoryId} deleted.` }], details: { action: "deleted", id: memoryId } };
        }
        if (query) {
          const uid = resolveUserId3({ agentId, userId });
          const results = await provider.search(query, buildSearchOptions(uid, 5));
          if (!results || results.length === 0) {
            return { content: [{ type: "text", text: "No matching memories found." }], details: { found: 0 } };
          }
          if (results.length === 1 || (results[0].score ?? 0) > 0.9) {
            await provider.delete(results[0].id);
            return { content: [{ type: "text", text: `Deleted: "${results[0].memory}"` }], details: { action: "deleted", id: results[0].id } };
          }
          const list = results.map(
            (r) => `- [${r.id}] ${r.memory.slice(0, 80)}${r.memory.length > 80 ? "..." : ""} (${((r.score ?? 0) * 100).toFixed(0)}%)`
          ).join("\n");
          return {
            content: [{ type: "text", text: `Found ${results.length} candidates. Specify memoryId:
${list}` }],
            details: { action: "candidates", candidates: results.map((r) => ({ id: r.id, memory: r.memory, score: r.score })) }
          };
        }
        if (all) {
          if (!confirm) {
            return { content: [{ type: "text", text: "Bulk deletion requires confirm: true." }], details: { error: "confirmation_required" } };
          }
          const uid = resolveUserId3({ agentId, userId });
          await provider.deleteAll(uid);
          deps.captureToolEvent("memory_delete", { success: true, latency_ms: Date.now() - start, delete_mode: "all" });
          api.logger.info(`openclaw-mem0: deleted all memories for user ${uid}`);
          return { content: [{ type: "text", text: `All memories deleted for user "${uid}".` }], details: { action: "deleted_all", user_id: uid } };
        }
        return { content: [{ type: "text", text: "Provide memoryId, query, or all:true." }], details: { error: "missing_param" } };
      } catch (err) {
        deps.captureToolEvent("memory_delete", { success: false, latency_ms: Date.now() - start, error: String(err) });
        return { content: [{ type: "text", text: `Memory delete failed: ${String(err)}` }], details: { error: String(err) } };
      }
    }
  };
}

// tools/memory-event-list.ts
import { Type as Type7 } from "@sinclair/typebox";
function createMemoryEventListTool(deps) {
  return {
    name: "memory_event_list",
    label: "Memory Event List",
    description: "List recent background processing events from the Mem0 Platform. Use to check whether memory operations (add, update, delete) were processed successfully.",
    parameters: Type7.Object({}),
    async execute(_toolCallId, _params) {
      const start = Date.now();
      try {
        if (!deps.backend) {
          deps.captureToolEvent("memory_event_list", { success: false, latency_ms: 0, error: "not_platform" });
          return {
            content: [{ type: "text", text: "Event tracking is only available in platform mode." }],
            details: { error: "not_platform" }
          };
        }
        const results = await deps.backend.listEvents();
        if (!results.length) {
          deps.captureToolEvent("memory_event_list", { success: true, latency_ms: Date.now() - start, count: 0 });
          return {
            content: [{ type: "text", text: "No events found." }],
            details: { count: 0 }
          };
        }
        const rows = results.map((ev) => {
          const evId = String(ev.id ?? "");
          const evType = String(ev.event_type ?? "\u2014");
          const status = String(ev.status ?? "\u2014");
          const latency = typeof ev.latency === "number" ? `${Math.round(ev.latency)}ms` : "\u2014";
          const created = String(ev.created_at ?? "\u2014").slice(0, 19).replace("T", " ");
          return { id: evId, type: evType, status, latency, created };
        });
        const text = rows.map((r) => `- ${r.id} | ${r.type} | ${r.status} | ${r.latency} | ${r.created}`).join("\n");
        deps.captureToolEvent("memory_event_list", { success: true, latency_ms: Date.now() - start, count: results.length });
        return {
          content: [{ type: "text", text: `${results.length} event(s):
${text}` }],
          details: { count: results.length, events: rows }
        };
      } catch (err) {
        deps.captureToolEvent("memory_event_list", { success: false, latency_ms: Date.now() - start, error: String(err) });
        return {
          content: [{ type: "text", text: `Failed to list events: ${String(err)}` }],
          details: { error: String(err) }
        };
      }
    }
  };
}

// tools/memory-event-status.ts
import { Type as Type8 } from "@sinclair/typebox";
function createMemoryEventStatusTool(deps) {
  return {
    name: "memory_event_status",
    label: "Memory Event Status",
    description: "Get detailed status of a specific background processing event. Use to verify whether a memory add/update/delete was processed, view latency, and inspect results.",
    parameters: Type8.Object({
      event_id: Type8.String({ description: "The event ID to check" })
    }),
    async execute(_toolCallId, params) {
      const { event_id: eventId } = params;
      const start = Date.now();
      try {
        if (!deps.backend) {
          deps.captureToolEvent("memory_event_status", { success: false, latency_ms: 0, error: "not_platform" });
          return {
            content: [{ type: "text", text: "Event tracking is only available in platform mode." }],
            details: { error: "not_platform" }
          };
        }
        const ev = await deps.backend.getEvent(eventId);
        const status = String(ev.status ?? "\u2014");
        const evType = String(ev.event_type ?? "\u2014");
        const latency = typeof ev.latency === "number" ? `${Math.round(ev.latency)}ms` : "\u2014";
        const created = String(ev.created_at ?? "\u2014").slice(0, 19).replace("T", " ");
        const updated = String(ev.updated_at ?? "\u2014").slice(0, 19).replace("T", " ");
        let text = `Event: ${eventId}
Type: ${evType}
Status: ${status}
Latency: ${latency}
Created: ${created}
Updated: ${updated}`;
        const results = ev.results;
        if (results && Array.isArray(results) && results.length) {
          const resultLines = results.map((r) => {
            const memId = String(r.id ?? "").slice(0, 8);
            const data = r.data;
            const memory = data?.memory ?? "";
            const evName = String(r.event ?? "");
            return `- [${evName}] ${memory} (${memId})`;
          });
          text += `

Results (${results.length}):
${resultLines.join("\n")}`;
        }
        deps.captureToolEvent("memory_event_status", { success: true, latency_ms: Date.now() - start });
        return {
          content: [{ type: "text", text }],
          details: { event: ev }
        };
      } catch (err) {
        deps.captureToolEvent("memory_event_status", { success: false, latency_ms: Date.now() - start, error: String(err) });
        return {
          content: [{ type: "text", text: `Failed to get event: ${String(err)}` }],
          details: { error: String(err) }
        };
      }
    }
  };
}

// tools/index.ts
function registerAllTools(deps) {
  const { api } = deps;
  const nonOptional = { optional: false };
  api.registerTool(createMemorySearchTool(deps), nonOptional);
  api.registerTool(createMemoryAddTool(deps), nonOptional);
  api.registerTool(createMemoryGetTool(deps), nonOptional);
  api.registerTool(createMemoryListTool(deps), nonOptional);
  api.registerTool(createMemoryUpdateTool(deps), nonOptional);
  api.registerTool(createMemoryDeleteTool(deps), nonOptional);
  api.registerTool(createMemoryEventListTool(deps), nonOptional);
  api.registerTool(createMemoryEventStatusTool(deps), nonOptional);
}

// index.ts
var memoryPlugin = definePluginEntry({
  id: "metamem",
  name: "Memory (Metamem)",
  description: "Mem0 memory backend \u2014 Mem0 platform or self-hosted open-source",
  register(api) {
    bootstrapTelemetryFlag();
    const pluginAuth = readPluginAuth();
    const fileConfig = {
      apiKey: pluginAuth.apiKey,
      baseUrl: pluginAuth.baseUrl
    };
    const cfg = mem0ConfigSchema.parse(api.pluginConfig, fileConfig);
    const isMetadataRegistration = api.registrationMode === "cli-metadata";
    const telemetryCtx = {
      apiKey: cfg.apiKey,
      mode: cfg.mode,
      skillsActive: false
    };
    const _captureEvent = (event, props) => {
      try {
        captureEvent(event, props, telemetryCtx);
      } catch {
      }
    };
    if (isMetadataRegistration) {
      registerCliCommands(
        api,
        null,
        null,
        cfg,
        () => cfg.userId,
        (id) => `${cfg.userId}:agent:${id}`,
        () => ({ user_id: cfg.userId, top_k: cfg.topK }),
        () => void 0,
        (cmd) => _captureEvent(`openclaw.cli.${cmd}`, { command: cmd })
      );
      return;
    }
    if (cfg.needsSetup) {
      api.logger.warn(
        "openclaw-mem0: API key not configured. Memory features are disabled.\n  To set up, run:\n  openclaw mem0 init\n  Get your key at: https://app.mem0.ai/dashboard/api-keys?utm_source=oss&utm_medium=openclaw-src"
      );
      registerCliCommands(
        api,
        null,
        null,
        cfg,
        () => cfg.userId,
        (id) => `${cfg.userId}:agent:${id}`,
        () => ({ user_id: cfg.userId, top_k: cfg.topK }),
        () => void 0,
        (cmd) => _captureEvent(`openclaw.cli.${cmd}`, { command: cmd })
      );
      api.registerService({
        id: "metamem",
        start: () => {
          api.logger.info("openclaw-mem0: waiting for API key configuration");
        },
        stop: () => {
        }
      });
      return;
    }
    const provider = createProvider(cfg, api);
    const lifecycle = createMemoryLifecycle();
    lifecycle.beginSession();
    let backend;
    if (cfg.mode === "platform") {
      backend = new PlatformBackend({
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl ?? metamemAuthOrigin()
      });
    } else {
      backend = providerToBackend(provider, cfg.userId);
    }
    let currentSessionId;
    let pluginStateDir;
    const _effectiveUserId = (sessionKey) => effectiveUserId(cfg.userId, sessionKey);
    const _agentUserId = (id) => agentUserId(cfg.userId, id);
    const _resolveUserId = (opts) => resolveUserId(cfg.userId, opts, currentSessionId);
    const skillsActive = isSkillsMode(cfg.skills);
    telemetryCtx.skillsActive = skillsActive;
    _captureEvent("openclaw.plugin.registered", {
      auto_recall: cfg.autoRecall,
      auto_capture: cfg.autoCapture
    });
    api.logger.info(
      `openclaw-mem0: registered (mode: ${cfg.mode}, user: ${cfg.userId}, autoRecall: ${cfg.autoRecall}, autoCapture: ${cfg.autoCapture}, skills: ${skillsActive})`
    );
    if (typeof api.registerMemoryCapability === "function") {
      api.registerMemoryCapability({
        publicArtifacts: createPublicArtifactsProvider({
          provider,
          effectiveUserId: _effectiveUserId
        }),
        runtime: {
          async getMemorySearchManager(_params) {
            try {
              const userId = _effectiveUserId();
              let memoryCount = 0;
              try {
                const memories = await provider.getAll({
                  user_id: userId,
                  page_size: 1,
                  source: "OPENCLAW"
                });
                memoryCount = Array.isArray(memories) ? memories.length : 0;
              } catch {
              }
              return {
                manager: {
                  status() {
                    return {
                      backend: cfg.mode,
                      files: 0,
                      chunks: memoryCount,
                      dirty: false,
                      workspaceDir: pluginStateDir ?? "",
                      userId
                    };
                  },
                  async probeEmbeddingAvailability() {
                    return { ok: true };
                  },
                  async close() {
                  }
                }
              };
            } catch (err) {
              return {
                manager: null,
                error: `mem0 ${cfg.mode} backend unavailable: ${String(err)}`
              };
            }
          },
          resolveMemoryBackendConfig(_params) {
            return {
              backend: cfg.mode,
              baseUrl: cfg.baseUrl ?? metamemAuthOrigin(),
              userId: cfg.userId
            };
          },
          async closeAllMemorySearchManagers() {
          }
        }
      });
      api.logger.debug("openclaw-mem0: memory capability + runtime registered");
    }
    function buildAddOptions(userIdOverride, runId, sessionKey) {
      const opts = {
        user_id: userIdOverride || _effectiveUserId(sessionKey),
        source: "OPENCLAW"
      };
      if (runId) opts.run_id = runId;
      if (cfg.customInstructions) opts.custom_instructions = cfg.customInstructions;
      const customCategories = customCategoryMapToList(cfg.customCategories);
      if (customCategories) opts.custom_categories = customCategories;
      return opts;
    }
    function buildSearchOptions(userIdOverride, limit, runId, sessionKey) {
      const recallCfg = cfg.skills?.recall;
      const opts = {
        user_id: userIdOverride || _effectiveUserId(sessionKey),
        top_k: limit ?? cfg.topK,
        threshold: recallCfg?.threshold ?? cfg.searchThreshold,
        source: "OPENCLAW"
      };
      if (runId) opts.run_id = runId;
      return opts;
    }
    const toolDeps = {
      api,
      provider,
      cfg,
      backend,
      resolveUserId: _resolveUserId,
      effectiveUserId: _effectiveUserId,
      agentUserId: _agentUserId,
      buildAddOptions,
      buildSearchOptions,
      getCurrentSessionId: () => currentSessionId,
      skillsActive,
      captureToolEvent: (toolName, props) => {
        _captureEvent(`openclaw.tool.${toolName}`, {
          tool_name: toolName,
          ...props
        });
      }
    };
    registerAllTools(toolDeps);
    registerCliCommands(
      api,
      backend,
      provider,
      cfg,
      _effectiveUserId,
      _agentUserId,
      buildSearchOptions,
      () => currentSessionId,
      (cmd) => _captureEvent(`openclaw.cli.${cmd}`, { command: cmd })
    );
    registerHooks(
      api,
      provider,
      cfg,
      _effectiveUserId,
      buildAddOptions,
      buildSearchOptions,
      {
        setCurrentSessionId: (id) => {
          currentSessionId = id;
        }
      },
      skillsActive,
      _captureEvent,
      lifecycle
    );
    api.registerService({
      id: "metamem",
      start: (...args) => {
        pluginStateDir = args[0]?.stateDir;
        api.logger.info(
          `openclaw-mem0: initialized (mode: ${cfg.mode}, user: ${cfg.userId}, autoRecall: ${cfg.autoRecall}, autoCapture: ${cfg.autoCapture}, stateDir: ${pluginStateDir ?? "none"})`
        );
      },
      stop: () => {
        api.logger.info("openclaw-mem0: stopped");
      }
    });
  }
});
function registerHooks(api, provider, cfg, _effectiveUserId, buildAddOptions, buildSearchOptions, session, skillsActive = false, _captureEvent = () => {
}, lifecycle = createMemoryLifecycle()) {
  if (skillsActive) {
    api.on("before_prompt_build", async (event, ctx) => {
      if (!event.prompt || event.prompt.length < 5) return;
      const trigger = ctx?.trigger ?? void 0;
      const sessionId = ctx?.sessionKey ?? void 0;
      if (isNonInteractiveTrigger(trigger, sessionId)) {
        api.logger.info(
          "openclaw-mem0: skills-mode skipping non-interactive trigger"
        );
        return;
      }
      const promptLower = event.prompt.toLowerCase();
      const isSystemPrompt = promptLower.includes("a new session was started") || promptLower.includes("session startup sequence") || promptLower.includes("/new or /reset") || promptLower.startsWith("run your session");
      if (isSystemPrompt) {
        api.logger.info(
          "openclaw-mem0: skills-mode skipping recall for system/bootstrap prompt"
        );
        const systemContext2 = loadCompactTriagePrompt(cfg.skills ?? {});
        return { prependSystemContext: systemContext2 };
      }
      if (sessionId) session.setCurrentSessionId(sessionId);
      const isSubagent = isSubagentSession(sessionId);
      const userId = _effectiveUserId(isSubagent ? void 0 : sessionId);
      let systemContext = loadCompactTriagePrompt(cfg.skills ?? {});
      if (isSubagent) {
        systemContext = "You are a subagent \u2014 use these memories for context but do not assume you are this user. Do NOT store new memories.\n\n" + systemContext;
      }
      let recallContext = "";
      const recallEnabled = cfg.skills?.recall?.enabled !== false;
      const recallStrategy = cfg.skills?.recall?.strategy ?? "smart";
      if (recallEnabled && recallStrategy !== "manual") {
        const recallStart = Date.now();
        try {
          const query = lifecycle.prepareUserText(sanitizeQuery(event.prompt));
          const sessionIdForRecall = recallStrategy === "always" ? isSubagent ? void 0 : sessionId : void 0;
          const recallResult = await recall(
            provider,
            query,
            userId,
            cfg.skills ?? {},
            sessionIdForRecall
          );
          api.logger.info(
            `openclaw-mem0: skills-mode recall (strategy=${recallStrategy}) injecting ${recallResult.memories.length} memories (~${recallResult.tokenEstimate} tokens)`
          );
          _captureEvent("openclaw.hook.recall", {
            strategy: recallStrategy,
            memory_count: recallResult.memories.length,
            latency_ms: Date.now() - recallStart
          });
          recallContext = recallResult.context;
        } catch (err) {
          api.logger.warn(
            `openclaw-mem0: skills-mode recall failed: ${String(err)}`
          );
        }
      } else if (recallEnabled && recallStrategy === "manual") {
        api.logger.info(
          "openclaw-mem0: skills-mode recall strategy=manual, agent controls search"
        );
      }
      return {
        prependSystemContext: systemContext,
        // cached by provider
        prependContext: recallContext
        // per-turn dynamic
      };
    });
    api.on("agent_end", async (event, ctx) => {
      const sessionId = ctx?.sessionKey ?? void 0;
      if (sessionId) session.setCurrentSessionId(sessionId);
      if (!event.success) return;
      api.logger.info("openclaw-mem0: skills-mode agent_end (no auto-capture)");
    });
    return;
  }
  let lastRecallSessionId;
  if (cfg.autoRecall) {
    const RECALL_TIMEOUT_MS = 8e3;
    api.on("before_prompt_build", async (event, ctx) => {
      if (!event.prompt || event.prompt.length < 5) return;
      const trigger = ctx?.trigger ?? void 0;
      const sessionId = ctx?.sessionKey ?? void 0;
      if (isNonInteractiveTrigger(trigger, sessionId)) {
        api.logger.info(
          "openclaw-mem0: skipping recall for non-interactive trigger"
        );
        return;
      }
      const promptLower = event.prompt.toLowerCase();
      const isSystemPrompt = promptLower.includes("a new session was started") || promptLower.includes("session startup sequence") || promptLower.includes("/new or /reset") || promptLower.startsWith("run your session");
      if (isSystemPrompt) {
        api.logger.info(
          "openclaw-mem0: skipping recall for system/bootstrap prompt"
        );
        return;
      }
      if (sessionId) session.setCurrentSessionId(sessionId);
      const isNewSession = sessionId !== void 0 && sessionId !== lastRecallSessionId;
      if (sessionId) lastRecallSessionId = sessionId;
      const isSubagent = isSubagentSession(sessionId);
      const recallSessionKey = isSubagent ? void 0 : sessionId;
      const cleanPrompt = event.prompt.replace(
        /Sender\s*\(untrusted metadata\):\s*```json[\s\S]*?```\s*/gi,
        ""
      ).trim();
      const safePrompt = lifecycle.prepareUserText(cleanPrompt);
      const recallStart = Date.now();
      const recallWork = async () => {
        const recallTopK = Math.max((cfg.topK ?? 5) * 2, 10);
        let longTermResults = await provider.search(
          safePrompt,
          buildSearchOptions(
            void 0,
            recallTopK,
            void 0,
            recallSessionKey
          )
        );
        longTermResults = longTermResults.filter(
          (r) => (r.score ?? 0) >= cfg.searchThreshold
        );
        if (longTermResults.length > 1) {
          const topScore = longTermResults[0]?.score ?? 0;
          if (topScore > 0) {
            longTermResults = longTermResults.filter(
              (r) => (r.score ?? 0) >= topScore * 0.5
            );
          }
        }
        if (isNewSession && safePrompt.length < 100) {
          const broadOpts = buildSearchOptions(
            void 0,
            5,
            void 0,
            recallSessionKey
          );
          broadOpts.threshold = cfg.searchThreshold;
          const broadResults = await provider.search(
            "recent decisions, preferences, active projects, and configuration",
            broadOpts
          );
          const existingIds = new Set(longTermResults.map((r) => r.id));
          for (const r of broadResults) {
            if (!existingIds.has(r.id)) {
              longTermResults.push(r);
            }
          }
        }
        longTermResults = longTermResults.slice(0, cfg.topK);
        if (longTermResults.length === 0) return void 0;
        const memoryContext = longTermResults.map(
          (r) => `- ${r.memory}${r.categories?.length ? ` [${r.categories.join(", ")}]` : ""}`
        ).join("\n");
        _captureEvent("openclaw.hook.recall", {
          strategy: "legacy",
          memory_count: longTermResults.length,
          latency_ms: Date.now() - recallStart
        });
        api.logger.info(
          `openclaw-mem0: injecting ${longTermResults.length} memories into context`
        );
        const preamble = isSubagent ? `The following are stored memories for user "${cfg.userId}". You are a subagent \u2014 use these memories for context but do not assume you are this user.` : `The following are stored memories for user "${cfg.userId}". Use them to personalize your response:`;
        return {
          prependContext: `<relevant-memories>
${preamble}
${memoryContext}
</relevant-memories>`
        };
      };
      try {
        const timeout = new Promise((resolve2) => {
          setTimeout(() => resolve2(void 0), RECALL_TIMEOUT_MS);
        });
        const result = await Promise.race([
          recallWork(),
          timeout.then(() => {
            api.logger.warn(
              `openclaw-mem0: recall timed out after ${RECALL_TIMEOUT_MS}ms, skipping`
            );
            return void 0;
          })
        ]);
        return result;
      } catch (err) {
        api.logger.warn(`openclaw-mem0: recall failed: ${String(err)}`);
      }
    });
  }
  if (cfg.autoCapture) {
    api.on("agent_end", async (event, ctx) => {
      if (!event.success || !event.messages || event.messages.length === 0) {
        return;
      }
      const trigger = ctx?.trigger ?? void 0;
      const sessionId = ctx?.sessionKey ?? void 0;
      if (isNonInteractiveTrigger(trigger, sessionId)) {
        api.logger.info(
          "openclaw-mem0: skipping capture for non-interactive trigger"
        );
        return;
      }
      if (isSubagentSession(sessionId)) {
        api.logger.info(
          "openclaw-mem0: skipping capture for subagent (main agent captures consolidated result)"
        );
        return;
      }
      if (sessionId) session.setCurrentSessionId(sessionId);
      const MEMORY_MUTATE_TOOLS = /* @__PURE__ */ new Set([
        "memory_add",
        "memory_update",
        "memory_delete"
      ]);
      const agentUsedMemoryTool = event.messages.some((msg) => {
        if (msg?.role !== "assistant" || !Array.isArray(msg?.content))
          return false;
        return msg.content.some(
          (block) => (block?.type === "tool_use" || block?.type === "toolCall") && MEMORY_MUTATE_TOOLS.has(block.name)
        );
      });
      if (agentUsedMemoryTool) {
        api.logger.info(
          "openclaw-mem0: skipping auto-capture \u2014 agent already used memory tools this turn"
        );
        return;
      }
      const SUMMARY_PATTERNS = [
        /## What I (Accomplished|Built|Updated)/i,
        /✅\s*(Done|Complete|All done)/i,
        /Here's (what I updated|the recap|a summary)/i,
        /### Changes Made/i,
        /Implementation Status/i,
        /All locked in\. Quick summary/i
      ];
      const allParsed = [];
      for (let i = 0; i < event.messages.length; i++) {
        const msg = event.messages[i];
        if (!msg || typeof msg !== "object") continue;
        const msgObj = msg;
        const role = msgObj.role;
        if (role !== "user" && role !== "assistant") continue;
        let textContent = "";
        const content = msgObj.content;
        if (typeof content === "string") {
          textContent = content;
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block && typeof block === "object" && "text" in block && typeof block.text === "string") {
              textContent += (textContent ? "\n" : "") + block.text;
            }
          }
        }
        if (!textContent) continue;
        if (textContent.includes("<relevant-memories>")) {
          textContent = textContent.replace(/<relevant-memories>[\s\S]*?<\/relevant-memories>\s*/g, "").trim();
          if (!textContent) continue;
        }
        if (textContent.includes("Sender") && textContent.includes("untrusted metadata")) {
          textContent = textContent.replace(
            /Sender\s*\(untrusted metadata\):\s*```json[\s\S]*?```\s*/gi,
            ""
          ).trim();
          if (!textContent) continue;
        }
        const isSummary = role === "assistant" && SUMMARY_PATTERNS.some((p) => p.test(textContent));
        allParsed.push({
          role,
          content: textContent,
          index: i,
          isSummary
        });
      }
      if (allParsed.length === 0) return;
      const recentWindow = 20;
      const recentCutoff = allParsed.length - recentWindow;
      const candidates = [];
      for (const msg of allParsed) {
        if (msg.isSummary && msg.index < recentCutoff) {
          candidates.push(msg);
        }
      }
      const seenIndices = new Set(candidates.map((m) => m.index));
      for (const msg of allParsed) {
        if (msg.index >= recentCutoff && !seenIndices.has(msg.index)) {
          candidates.push(msg);
        }
      }
      candidates.sort((a, b) => a.index - b.index);
      const selected = candidates.map((m) => ({
        role: m.role,
        content: m.content
      }));
      const formattedMessages = lifecycle.prepareConversation(filterMessagesForExtraction(selected));
      if (formattedMessages.length === 0) return;
      if (!formattedMessages.some((m) => m.role === "user")) return;
      const userContent = formattedMessages.filter((m) => m.role === "user").map((m) => m.content).join(" ");
      if (userContent.length < 50) {
        api.logger.info(
          "openclaw-mem0: skipping capture \u2014 user content too short for meaningful extraction"
        );
        return;
      }
      const timestamp = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      formattedMessages.unshift({
        role: "system",
        content: `Current date: ${timestamp}. The user is identified as "${cfg.userId}". Extract durable facts from this conversation. Include this date when storing time-sensitive information.`
      });
      const addOpts = buildAddOptions(void 0, void 0, sessionId);
      const captureStart = Date.now();
      provider.add(formattedMessages, addOpts).then((result) => {
        const capturedCount = result.results?.length ?? 0;
        _captureEvent("openclaw.hook.capture", {
          captured_count: capturedCount,
          latency_ms: Date.now() - captureStart
        });
        if (capturedCount > 0) {
          api.logger.info(
            `openclaw-mem0: auto-captured ${capturedCount} memories`
          );
        }
      }).catch((err) => {
        api.logger.warn(`openclaw-mem0: capture failed: ${String(err)}`);
      });
    });
  }
}
var index_default = memoryPlugin;
export {
  agentUserId,
  createProvider,
  index_default as default,
  effectiveUserId,
  extractAgentId,
  filterMessagesForExtraction,
  isGenericAssistantMessage,
  isNoiseMessage,
  isNonInteractiveTrigger,
  isSessionSpecificContent,
  isSubagentSession,
  mem0ConfigSchema,
  resolveUserId,
  stripNoiseFromContent
};
//# sourceMappingURL=index.js.map