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

function send(obj) {
    process.stdout.write(JSON.stringify(obj) + "\n");
}

rl.on("line", (line) => {
    let cmd;
    try { cmd = JSON.parse(line); } catch { return; }

    if (cmd.type === "send") {
        // Fire-and-forget; multiple workspaces can run concurrently
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
    }
});

async function handleSend(cmd) {
    const workspaceId = cmd.workspaceId || "default";
    const abortController = new AbortController();
    aborts.set(workspaceId, abortController);

    // Helper: tag every event with workspaceId
    const sendWs = (obj) => send({ ...obj, workspaceId });

    try {
        const opts = {
            cwd: cmd.cwd || process.cwd(),
            permissionMode: "bypassPermissions",
            maxTurns: cmd.maxTurns || 50,
        };

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

        const stream = query({
            prompt: cmd.message,
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
                const content = message.message?.content;
                if (!content) continue;

                for (const block of content) {
                    if (block.type === "text" && block.text) {
                        sendWs({ type: "text", text: block.text });
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
                sendWs({
                    type: "done",
                    success: message.subtype === "success",
                    duration_ms: message.duration_ms || 0,
                    cost: message.total_cost_usd || 0,
                    num_turns: message.num_turns || 0,
                    input_tokens: message.usage?.input_tokens || 0,
                    output_tokens: message.usage?.output_tokens || 0,
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
