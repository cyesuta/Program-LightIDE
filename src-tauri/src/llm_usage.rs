//! LLM usage logging to Supabase (末日圖書館 llm_usage 表)

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::command;

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct LlmUsagePayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub num_turns: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_subagent: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aborted: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hostname: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub os: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key_alias: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_creation_tokens: Option<i64>,
    #[serde(default, skip_serializing)]
    pub cache_creation_5m_tokens: Option<i64>,
    #[serde(default, skip_serializing)]
    pub cache_creation_1h_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_read_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost_usd: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remarks: Option<serde_json::Value>,
    // Client-only flag; stripped before sending to Supabase
    #[serde(default, skip_serializing)]
    pub should_probe: Option<bool>,
}

static ENV_CACHE: OnceLock<HashMap<String, String>> = OnceLock::new();

fn parse_env_file(content: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some(eq_idx) = trimmed.find('=') {
            let key = trimmed[..eq_idx].trim().to_string();
            let mut val = trimmed[eq_idx + 1..].trim().to_string();
            if (val.starts_with('"') && val.ends_with('"'))
                || (val.starts_with('\'') && val.ends_with('\''))
            {
                val = val[1..val.len() - 1].to_string();
            }
            map.insert(key, val);
        }
    }
    map
}

fn find_env_path() -> Option<PathBuf> {
    if let Ok(cwd) = std::env::current_dir() {
        let p = cwd.join(".env");
        if p.exists() {
            return Some(p);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(|p| p.to_path_buf());
        for _ in 0..5 {
            if let Some(d) = &dir {
                let p = d.join(".env");
                if p.exists() {
                    return Some(p);
                }
                dir = d.parent().map(|p| p.to_path_buf());
            }
        }
    }
    None
}

fn get_env() -> &'static HashMap<String, String> {
    ENV_CACHE.get_or_init(|| {
        find_env_path()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .map(|s| parse_env_file(&s))
            .unwrap_or_default()
    })
}

/// Base input $/MTok. Other rates: output 5x, cache_read 0.1x, cache_5m 1.25x, cache_1h 2x.
/// Source: https://claude.com/pricing#api + prompt-caching docs.
fn base_input_price(model: &str) -> Option<f64> {
    let m = model.to_lowercase();
    // Opus 4 / 4.1 are legacy $15 tier; 4.5+ dropped to $5
    if m == "claude-opus-4" || m.starts_with("claude-opus-4-0") || m.starts_with("claude-opus-4-1") {
        return Some(15.0);
    }
    if m.contains("opus") {
        return Some(5.0);
    }
    if m.contains("sonnet") {
        return Some(3.0);
    }
    if m.contains("haiku-3-5") || m.contains("haiku-3.5") {
        return Some(0.80);
    }
    if m.contains("haiku") {
        return Some(1.0);
    }
    None
}

fn spawn_usage_probe(lightide_dir: &std::path::Path) {
    let probe = lightide_dir.join(".claude/hooks/usage-probe.mjs");
    if !probe.exists() {
        return;
    }
    // Single-flight: if probe ran recently (within 90s), skip to avoid overlap.
    let lock = lightide_dir.join(".claude/usage-probe.lock");
    if let Ok(meta) = std::fs::metadata(&lock) {
        if let Ok(mod_time) = meta.modified() {
            if let Ok(elapsed) = mod_time.elapsed() {
                if elapsed.as_secs() < 90 {
                    return;
                }
            }
        }
    }
    let _ = std::fs::write(&lock, std::process::id().to_string());

    let mut cmd = std::process::Command::new("node");
    cmd.arg(&probe)
        .current_dir(lightide_dir)
        .env("CLAUDE_PROJECT_DIR", lightide_dir)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW (0x08000000) | CREATE_NEW_PROCESS_GROUP (0x00000200).
        // Must NOT combine DETACHED_PROCESS — it gives the child no console at all,
        // which makes node-pty's conpty_console_list_agent crash on AttachConsole().
        cmd.creation_flags(0x08000000 | 0x00000200);
    }

    let _ = cmd.spawn();
}

fn compute_cost_usd(p: &LlmUsagePayload) -> f64 {
    let model = match p.model.as_deref() {
        Some(m) => m,
        None => return 0.0,
    };
    let base = match base_input_price(model) {
        Some(b) => b,
        None => return 0.0,
    };
    let input = p.input_tokens.unwrap_or(0) as f64;
    let output = p.output_tokens.unwrap_or(0) as f64;
    let cache_read = p.cache_read_tokens.unwrap_or(0) as f64;
    let (cache_5m, cache_1h) = match (p.cache_creation_5m_tokens, p.cache_creation_1h_tokens) {
        (Some(a), Some(b)) if a + b > 0 => (a as f64, b as f64),
        _ => (p.cache_creation_tokens.unwrap_or(0) as f64, 0.0),
    };
    (input * base
        + output * base * 5.0
        + cache_read * base * 0.1
        + cache_5m * base * 1.25
        + cache_1h * base * 2.0)
        / 1_000_000.0
}

#[command]
pub async fn log_llm_usage(mut payload: LlmUsagePayload) -> Result<(), String> {
    let env = get_env();
    let url = env
        .get("SUPABASE_URL")
        .ok_or_else(|| "SUPABASE_URL missing in .env".to_string())?;
    let key = env
        .get("SUPABASE_SERVICE_ROLE_KEY")
        .ok_or_else(|| "SUPABASE_SERVICE_ROLE_KEY missing in .env".to_string())?;

    // Fill defaults if not provided
    if payload.provider.is_none() {
        payload.provider = Some("anthropic".to_string());
    }
    if payload.hostname.is_none() {
        // Prefer system API (preserves original case "Cyesuta-PC2");
        // Windows $COMPUTERNAME is always uppercased ("CYESUTA-PC2") which would
        // produce inconsistent rows vs Node's os.hostname() used by the CLI hook.
        let hn = gethostname::gethostname().to_string_lossy().to_string();
        payload.hostname = Some(if hn.is_empty() {
            std::env::var("COMPUTERNAME")
                .or_else(|_| std::env::var("HOSTNAME"))
                .unwrap_or_else(|_| "unknown".to_string())
        } else {
            hn
        });
    }
    if payload.os.is_none() {
        let mapped = match std::env::consts::OS {
            "windows" => "win32",
            "macos" => "darwin",
            other => other,
        };
        payload.os = Some(mapped.to_string());
    }
    if payload.total_tokens.is_none() {
        let sum = payload.input_tokens.unwrap_or(0)
            + payload.cache_creation_tokens.unwrap_or(0)
            + payload.cache_read_tokens.unwrap_or(0)
            + payload.output_tokens.unwrap_or(0);
        payload.total_tokens = Some(sum);
    }

    // If SDK didn't provide a cost (e.g. subscription user → total_cost_usd = 0),
    // compute from tokens using official pricing.
    if payload.cost_usd.unwrap_or(0.0) == 0.0 {
        let computed = compute_cost_usd(&payload);
        if computed > 0.0 {
            payload.cost_usd = Some((computed * 1_000_000.0).round() / 1_000_000.0);
        }
    }

    // Attach cached /usage info into remarks (shared with the Claude Code CLI hook).
    // Cache is project-local to LightIDE's repo, regardless of which workspace is active —
    // /usage data is user-account-wide, not per-project.
    let lightide_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_default();
    let cache_path = lightide_dir.join(".claude").join("usage-cache.json");
    if payload.remarks.is_none() {
        if let Ok(text) = std::fs::read_to_string(&cache_path) {
            if let Ok(mut val) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Ok(meta) = std::fs::metadata(&cache_path) {
                    if let Ok(mod_time) = meta.modified() {
                        if let Ok(elapsed) = mod_time.elapsed() {
                            if let Some(obj) = val.as_object_mut() {
                                obj.insert(
                                    "cache_age_sec".to_string(),
                                    serde_json::json!(elapsed.as_secs()),
                                );
                            }
                        }
                    }
                }
                payload.remarks = Some(val);
            }
        }
    }

    // Every N turns the client asks us to refresh /usage. Spawn the probe detached;
    // it writes back to the shared cache file, picked up by the next log_llm_usage call.
    if payload.should_probe.unwrap_or(false) {
        spawn_usage_probe(&lightide_dir);
    }
    payload.should_probe = None;

    let endpoint = format!("{}/rest/v1/llm_usage", url.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("http client: {e}"))?;

    let resp = client
        .post(&endpoint)
        .header("apikey", key)
        .header("Authorization", format!("Bearer {key}"))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("supabase {status}: {body}"));
    }
    Ok(())
}
