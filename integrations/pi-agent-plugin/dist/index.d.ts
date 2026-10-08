import { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import MemoryClient from 'mem0ai';
import { c as createMemoryLifecycle } from './entry-BUDzcvbJ.js';
export { e as extractConversation, m as mem0Extension } from './entry-BUDzcvbJ.js';

type Scope = "project" | "session" | "global";
interface Mem0Config {
    apiKey: string;
    userId: string;
    autoCapture: boolean;
    defaultScope: Scope;
    contextInjection: boolean;
    searchThreshold: number;
}
interface ScopeContext {
    userId: string;
    appId: string;
    runId: string;
}
interface CustomCategory {
    [key: string]: string;
}
declare const DEFAULT_CUSTOM_CATEGORIES: CustomCategory[];

declare const CONFIG_DIR: string;
declare function loadConfig(): Mem0Config;

interface ToolParams {
    action: "search" | "add" | "get_all" | "update" | "delete" | "delete_all";
    query?: string;
    content?: string;
    memory_id?: string;
    scope?: Scope;
}
declare function buildToolExecute(mem0: MemoryClient, scopeCtx: ScopeContext, defaultScope: Scope): (params: ToolParams, signal?: AbortSignal) => Promise<{
    content: {
        type: "text";
        text: string;
    }[];
    details: {
        matchCount: number;
        eventId?: undefined;
        status?: undefined;
        totalCount?: undefined;
        memoryId?: undefined;
    };
} | {
    content: {
        type: "text";
        text: string;
    }[];
    details: {
        eventId: string | null;
        status: string | null;
        matchCount?: undefined;
        totalCount?: undefined;
        memoryId?: undefined;
    };
} | {
    content: {
        type: "text";
        text: string;
    }[];
    details: {
        totalCount: number;
        matchCount?: undefined;
        eventId?: undefined;
        status?: undefined;
        memoryId?: undefined;
    };
} | {
    content: {
        type: "text";
        text: string;
    }[];
    details: {
        memoryId: string;
        matchCount?: undefined;
        eventId?: undefined;
        status?: undefined;
        totalCount?: undefined;
    };
} | {
    content: {
        type: "text";
        text: string;
    }[];
    details: {
        matchCount?: undefined;
        eventId?: undefined;
        status?: undefined;
        totalCount?: undefined;
        memoryId?: undefined;
    };
}>;
declare function registerMemoryTool(pi: ExtensionAPI, mem0: MemoryClient, config: Mem0Config, getScopeCtx: () => ScopeContext, telemetryCtx?: {
    apiKey?: string;
}): void;

declare function detectAppId(cwd: string): string;
declare function detectRunId(sessionFile: string | undefined): string;
declare function resolveSearchFilters(scope: Scope, ctx: ScopeContext): Record<string, string>;
declare function resolveAddParams(scope: Scope, ctx: ScopeContext): Record<string, string>;

interface MemoryLike {
    id: string;
    memory?: string;
    categories?: string[];
    createdAt?: Date | string;
}
declare function formatAge(date: Date | string): string;
declare function formatMemoryCompact(memory: MemoryLike): string;
declare function formatMemoryList(memories: MemoryLike[]): string;
declare function groupByCategory(memories: MemoryLike[]): Map<string, MemoryLike[]>;

declare function setupAutoCapture(pi: ExtensionAPI, mem0: MemoryClient, config: Mem0Config, getScopeCtx: () => ScopeContext, telemetryCtx?: {
    apiKey?: string;
}, lifecycle?: ReturnType<typeof createMemoryLifecycle>): void;

declare const MEMORY_POLICY = "<mem0-memory-policy>\nYou have persistent semantic memory via the mem0_memory tool, powered by Mem0. Relevant memories may be auto-injected under <mem0-relevant-memories>.\n\nUse mem0_memory with action \"search\" before repeating investigation or when earlier decisions, fixes, commands, or results may help.\n\nBe proactive about saving:\n- Save important facts, preferences, goals, decisions, lessons learned, identity, relationships, and routines the user shares.\n\nScope (do not change unless explicitly asked):\n- \"project\" (default): memories for this project \u2014 use for all normal queries\n- \"session\": memories from this session only\n- \"global\": all memories across projects \u2014 ONLY when the user explicitly asks for cross-project search\n\nMemory persists across sessions and devices via Mem0's cloud.\n</mem0-memory-policy>";

declare function registerCommands(pi: ExtensionAPI, mem0: MemoryClient, config: Mem0Config, getScopeCtx: () => ScopeContext, telemetryCtx?: {
    apiKey?: string;
}): void;

declare function captureEvent(eventName: string, properties?: Record<string, unknown>, context?: {
    apiKey?: string;
}): void;
declare function captureToolEvent(action: string, properties?: Record<string, unknown>, context?: {
    apiKey?: string;
}): void;
declare function captureCommandEvent(command: string, properties?: Record<string, unknown>, context?: {
    apiKey?: string;
}): void;
declare function _getEventQueue(): Record<string, unknown>[];
declare function _resetForTesting(): void;

export { CONFIG_DIR, type CustomCategory, DEFAULT_CUSTOM_CATEGORIES, MEMORY_POLICY, type Mem0Config, type Scope, type ScopeContext, _getEventQueue, _resetForTesting, buildToolExecute, captureCommandEvent, captureEvent, captureToolEvent, detectAppId, detectRunId, formatAge, formatMemoryCompact, formatMemoryList, groupByCategory, loadConfig, registerCommands, registerMemoryTool, resolveAddParams, resolveSearchFilters, setupAutoCapture };
