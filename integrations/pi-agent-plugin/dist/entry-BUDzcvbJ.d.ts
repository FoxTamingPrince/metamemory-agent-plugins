import { ExtensionAPI } from '@earendil-works/pi-coding-agent';

interface MessageLike {
    role: string;
    content?: unknown;
}
declare function extractConversation(messages: MessageLike[]): Array<{
    role: "user" | "assistant";
    content: string;
}>;
interface RecallOptions {
    heading?: string;
    maxChars?: number;
    seenIds?: Set<string>;
    timeoutMs?: number;
}
interface MemoryLifecycleOptions {
    recallHeading?: string;
    maxContextChars?: number;
    recallTimeoutMs?: number;
}
/** Shared lifecycle policy. Host adapters only translate native events into these operations. */
declare class MemoryLifecycle {
    #private;
    constructor(options?: MemoryLifecycleOptions);
    beginSession(): void;
    prepareConversation(messages: MessageLike[]): Array<{
        role: "user" | "assistant";
        content: string;
    }>;
    prepareUserText(value: unknown): string;
    recall(prompt: string, enabled: boolean, search: (query: string) => Promise<{
        results?: unknown[];
    }>): Promise<string>;
}
declare function createMemoryLifecycle(options?: MemoryLifecycleOptions): MemoryLifecycle;
declare function buildRecallContext(prompt: string, enabled: boolean, search: (query: string) => Promise<{
    results?: unknown[];
}>, options?: RecallOptions): Promise<string>;

declare function resolveUserId(configUserId: string): string;
declare function mem0Extension(pi: ExtensionAPI): void;

export { buildRecallContext as b, createMemoryLifecycle as c, extractConversation as e, mem0Extension as m, resolveUserId as r };
