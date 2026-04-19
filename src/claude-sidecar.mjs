/**
 * LightIDE Claude Sidecar
 * Long-running Node.js process using @anthropic-ai/claude-agent-sdk
 * Communicates with Rust backend via stdin/stdout JSON lines
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { createInterface } from "readline";

const rl = createInterface({ input: process.stdin });

// Session IDs per workspace: workspaceId -> sessionId
const sessions = new Map();
// Abort controllers per workspace: workspaceId -> AbortController
const aborts = new Map();
// Pending bg task spawn requests: reqId -> {resolve, reject}
const pendingBgSpawns = new Map();

function send(obj) {
    process.stdout.write(JSON.stringify(obj) + "\n");
}

rl.on("line", (line) => {
    let cmd;
    try { cmd = JSON.parse(line); } catch { return; }

    if (cmd.type === "send") {
        handleSend(cmd).catch(e => {
            send({ type: "error", workspaceId: cmd.workspaceId || "default", message: e.message || String(e) });
        });
    } else if (cmd.type === "abort") {
        const wid = cmd.workspaceId || "default";
        const ab = aborts.get(wid);
        if (ab) ab.abort();
    } else if (cmd.type === "reset") {
        const wid = cmd.workspaceId || "default";
        sessions.delete(wid);
        send({ type: "reset_done", workspaceId: wid });
    } else if (cmd.type === "bg_spawn_response") {
        const pending = pendingBgSpawns.get(cmd.reqId);
        if (pending) {
            pending.resolve(cmd);
            pendingBgSpawns.delete(cmd.reqId);
        }
    }
});

function requestBgSpawn(workspaceId, command, cwd) {
    const reqId = `bg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    send({
        type: "bg_spawn_request",
        workspaceId,
        reqId,
        command,
        cwd,
    });
    return new Promise((resolve, reject) => {
        pendingBgSpawns.set(reqId, { resolve, reject });
        // 15 second timeout
        setTimeout(() => {
            if (pendingBgSpawns.has(reqId)) {
                pendingBgSpawns.delete(reqId);
                reject(new Error("Background task spawn timed out"));
            }
        }, 15000);
    });
}

async function handleSend(cmd) {
    const workspaceId = cmd.workspaceId || "default";
    const abortController = new AbortController();
    aborts.set(workspaceId, abortController);

    // Helper: tag every event with workspaceId
    const sendWs = (obj) => send({ ...obj, workspaceId });

    try {
        const opts = {
            cwd: cmd.cwd || process.cwd(),
            // NOTE: "default" so canUseTool is invoked; canUseTool allows everything
            // except background Bash (which it intercepts and reroutes to terminal).
            permissionMode: "default",
            maxTurns: cmd.maxTurns || 50,
            // Default to Sonnet 4.5 (cheaper and stable). Override via cmd.model.
            model: cmd.model || "claude-sonnet-4-5",
            // Explicit isolation: don't load any filesystem settings
            // (no ~/.claude/settings.json, no .claude/settings.json, no plugins, no skills)
            settingSources: [],
        };

        // Intercept background Bash: redirect to LightIDE terminal with log file.
        // Strategy: ALLOW with updated input that is a cheap `echo` command.
        // This returns a "successful" tool_result to Claude so it won't retry.
        opts.canUseTool = async (toolName, toolInput) => {
            if (toolName === "Bash" && toolInput.run_in_background === true) {
                try {
                    const response = await requestBgSpawn(
                        workspaceId,
                        toolInput.command,
                        opts.cwd,
                    );
                    if (response.success) {
                        const msg = `[Task dispatched — STOP HERE] The command has been sent to a dedicated LightIDE terminal tab where the user sees real-time output directly. You MUST NOT:
- Read, cat, tail, or grep the log file
- Run the command again in any form (including with different flags)
- Try alternative approaches to get the output
- Sleep and retry
Instead you MUST simply tell the user in one short sentence that the task is running in the terminal, then STOP your response. The user will tell you later if they want you to check the result. Do not mention the log file path unless asked.`;
                        return {
                            behavior: "allow",
                            updatedInput: {
                                command: `echo '${msg.replace(/'/g, "'\"'\"'")}'`,
                                description: "Dispatch notification",
                            },
                        };
                    } else {
                        return {
                            behavior: "allow",
                            updatedInput: {
                                command: `echo 'Failed to dispatch to LightIDE terminal: ${(response.error || "unknown").replace(/'/g, "")}. User should run this manually.'`,
                            },
                        };
                    }
                } catch (e) {
                    return {
                        behavior: "allow",
                        updatedInput: {
                            command: `echo 'Could not dispatch background task: ${(e.message || String(e)).replace(/'/g, "")}'`,
                        },
                    };
                }
            }
            return { behavior: "allow", updatedInput: toolInput };
        };

        // Thinking mode: 4.6 uses adaptive, 4.5 uses enabled with budget
        if (cmd.thinking) {
            const m = cmd.model || "";
            if (m.includes("4-6")) {
                opts.thinking = { type: "adaptive" };
            } else {
                opts.thinking = { type: "enabled", budgetTokens: 8000 };
            }
        } else {
            opts.thinking = { type: "disabled" };
        }

        // System prompt mode:
        //   "minimal" (default): short custom prompt + restricted tools, fastest/cheapest
        //   "full": use Claude Code preset + all tools, includes CLAUDE.md memory
        const promptMode = cmd.promptMode || "minimal";
        if (promptMode === "full") {
            opts.systemPrompt = {
                type: "preset",
                preset: "claude_code",
            };
            // Full mode loads project settings for CLAUDE.md
            opts.settingSources = ["project"];
        } else {
            opts.systemPrompt = `You are a helpful coding assistant integrated into LightIDE, a lightweight code editor. You can read, write, and edit files, run bash commands, and help the user with their code. Be concise and direct. The current working directory is the user's project.`;
            // Allow all built-in tools (don't restrict)
        }

        // Resume session: prefer explicit sessionId from frontend (survives sidecar restart),
        // fall back to in-memory tracked session
        const explicitSession = cmd.sessionId;
        const existingSession = explicitSession || sessions.get(workspaceId);
        if (existingSession) {
            opts.resume = existingSession;
            // Also seed the in-memory map so subsequent sends in this session work
            if (explicitSession && !sessions.has(workspaceId)) {
                sessions.set(workspaceId, explicitSession);
            }
        }

        if (cmd.allowedTools) {
            opts.allowedTools = cmd.allowedTools;
        }

        // Use streaming input only when images are attached; otherwise use
        // plain string prompt (more reliable, completes predictably).
        let promptArg;
        if (Array.isArray(cmd.images) && cmd.images.length > 0) {
            const content = [];
            if (cmd.message) {
                content.push({ type: "text", text: cmd.message });
            }
            for (const img of cmd.images) {
                content.push({
                    type: "image",
                    source: {
                        type: "base64",
                        media_type: img.mediaType || "image/png",
                        data: img.data,
                    },
                });
            }
            const userMessage = {
                type: "user",
                message: { role: "user", content },
                parent_tool_use_id: null,
            };
            promptArg = (async function* () { yield userMessage; })();
        } else {
            promptArg = cmd.message;
        }

        // DEBUG: log which model is actually being used
        process.stderr.write(`[Claude Sidecar] Query starting — model: ${opts.model}, workspaceId: ${workspaceId}, resume: ${opts.resume || "none"}, thinking: ${JSON.stringify(opts.thinking)}\n`);

        const stream = query({
            prompt: promptArg,
            abortController,
            options: opts,
        });

        for await (const message of stream) {
            const type = message.type;

            // Track session ID from any message that has it
            if (message.session_id && !sessions.get(workspaceId)) {
                sessions.set(workspaceId, message.session_id);
                sendWs({ type: "session", sessionId: message.session_id });
            }

            if (type === "assistant") {
                // DEBUG: log the actual model in the response
                if (message.message?.model) {
                    process.stderr.write(`[Claude Sidecar] Response from model: ${message.message.model}\n`);
                }
                const content = message.message?.content;
                if (!content) continue;

                for (const block of content) {
                    if (block.type === "text" && block.text) {
                        sendWs({ type: "text", text: block.text });
                    } else if (block.type === "thinking" && block.thinking) {
                        sendWs({ type: "thinking", text: block.thinking });
                    } else if (block.type === "tool_use") {
                        sendWs({
                            type: "tool_use",
                            id: block.id,
                            name: block.name,
                            input: block.input,
                        });
                    }
                }

                // Send usage info
                const usage = message.message?.usage;
                if (usage) {
                    sendWs({
                        type: "usage",
                        input_tokens: usage.input_tokens || 0,
                        output_tokens: usage.output_tokens || 0,
                        cache_read: usage.cache_read_input_tokens || 0,
                        cache_create: usage.cache_creation_input_tokens || 0,
                    });
                }
            } else if (type === "user") {
                // Tool results
                const content = message.message?.content;
                if (!content) continue;

                for (const block of content) {
                    if (block.type === "tool_result") {
                        let output = "";
                        if (message.tool_use_result) {
                            output = message.tool_use_result.stdout || "";
                            if (message.tool_use_result.stderr) {
                                output += (output ? "\n" : "") + message.tool_use_result.stderr;
                            }
                        } else if (typeof block.content === "string") {
                            output = block.content;
                        }
                        sendWs({
                            type: "tool_result",
                            id: block.tool_use_id,
                            output,
                            is_error: block.is_error || false,
                        });
                    }
                }
            } else if (type === "result") {
                const cc = message.usage?.cache_creation || {};
                sendWs({
                    type: "done",
                    success: message.subtype === "success",
                    duration_ms: message.duration_ms || 0,
                    cost: message.total_cost_usd || 0,
                    num_turns: message.num_turns || 0,
                    model: message.model || null,
                    input_tokens: message.usage?.input_tokens || 0,
                    output_tokens: message.usage?.output_tokens || 0,
                    cache_read_tokens: message.usage?.cache_read_input_tokens || 0,
                    cache_creation_tokens: message.usage?.cache_creation_input_tokens || 0,
                    cache_creation_5m_tokens: cc.ephemeral_5m_input_tokens || 0,
                    cache_creation_1h_tokens: cc.ephemeral_1h_input_tokens || 0,
                });
            }
        }
    } catch (e) {
        if (e.name === "AbortError") {
            sendWs({ type: "done", success: false, aborted: true });
        } else {
            sendWs({ type: "error", message: e.message || String(e) });
        }
    }

    aborts.delete(workspaceId);
}

// Keep alive
process.on("SIGINT", () => process.exit(0));
send({ type: "ready" });
