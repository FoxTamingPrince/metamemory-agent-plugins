import { Context } from '@deepseek-ai/cordis';

/**
 * deepseek-plugin: Mem0 long-term memory as a native DeepSeek Harness (Cordis) plugin.
 *
 * Registers two agent-callable tools backed by the Mem0 SDK:
 *   - `search_memory` recalls facts relevant to a query
 *   - `add_memory` stores a fact for future sessions
 *
 * A plugin is a Cordis module that exports `apply(ctx, config)`. Declaring
 * `inject = ['tools', 'systemPrompt']` holds the plugin until the harness services exist;
 * tools registered via `ctx.tools.register(...)` are auto-unregistered when the
 * plugin unmounts (Cordis revertible effects).
 */

declare const name = "mem0";
declare const inject: string[];
interface Config {
    /** Mem0 API key. Defaults to the MEM0_API_KEY env var. */
    apiKey?: string;
    /** Default entity that owns the memories (Mem0 user scope). */
    userId: string;
    /** Explicitly allow model-selected cross-user access. Defaults to false. */
    allowUserOverride?: boolean;
    /** Optional Mem0 Platform base-URL override (on-prem / dedicated); defaults to api.mem0.ai. Not a switch to self-hosted OSS. */
    host?: string;
    /** Recall relevant memory before each model request. Defaults to true. */
    autoRecall?: boolean;
    /** Store completed turns automatically. Defaults to true. */
    autoCapture?: boolean;
}
declare function apply(ctx: Context, config: Config): void;

export { type Config, apply, inject, name };
