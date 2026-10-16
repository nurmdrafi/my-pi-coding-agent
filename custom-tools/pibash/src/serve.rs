//! `--serve`: persistent NDJSON daemon. One request per line, one response
//! per line, `id` echoed so concurrent callers can match replies.

use std::io::{BufRead, Write};

use crate::cli::Request;
use crate::execute_with;

#[derive(serde::Deserialize)]
struct ServeRequest {
    id: serde_json::Value,
    command: String,
    #[serde(default)]
    cwd: Option<String>,
    #[serde(default)]
    timeout: Option<f64>,
}

/// Read requests until stdin closes; never exits on a per-line error.
pub fn run() -> Result<(), String> {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    let mut line = String::new();
    let mut out: Vec<u8> = Vec::with_capacity(8 * 1024);
    loop {
        line.clear();
        let read = stdin
            .lock()
            .read_line(&mut line)
            .map_err(|err| err.to_string())?;
        if read == 0 {
            return Ok(());
        }
        if line.trim().is_empty() {
            continue;
        }
        handle_line(&line, &mut out);
        out.push(b'\n');
        let _ = stdout.write_all(&out);
        let _ = stdout.flush();
    }
}

/// One request line → one response line.
///
/// Serializes straight into a reused `Vec<u8>`: the previous shape built a
/// `serde_json::Value` tree and then re-serialized it to a `String`, copying
/// the whole (potentially hundreds-of-KB) payload twice for no benefit.
fn handle_line(line: &str, out: &mut Vec<u8>) {
    out.clear();
    let parsed: ServeRequest = match serde_json::from_str(line) {
        Ok(parsed) => parsed,
        Err(err) => {
            let failure = serde_json::json!({
                "id": serde_json::Value::Null,
                "ok": false,
                "error": { "kind": "protocol", "message": err.to_string() }
            });
            let _ = serde_json::to_writer(&mut *out, &failure);
            return;
        }
    };
    let request = Request {
        command: parsed.command,
        cwd: parsed
            .cwd
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| {
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
            }),
        timeout_seconds: parsed.timeout.filter(|secs| *secs > 0.0),
    };
    // Write the payload, then splice the echoed `id` in after the opening
    // brace, so no intermediate object/tree is materialized.
    let id_json = serde_json::to_string(&parsed.id).unwrap_or_else(|_| "null".to_string());
    out.push(b'{');
    out.extend_from_slice(b"\"id\":");
    out.extend_from_slice(id_json.as_bytes());
    match execute_with(&request, true) {
        Ok(success) => {
            let mut body = Vec::with_capacity(1024);
            let _ = serde_json::to_writer(&mut body, &success);
            // body[0] is '{'; append everything after it.
            out.push(b',');
            out.extend_from_slice(&body[1..]);
        }
        Err(failure) => {
            let mut body = Vec::with_capacity(256);
            let _ = serde_json::to_writer(&mut body, &failure);
            out.push(b',');
            out.extend_from_slice(&body[1..]);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn handle_to_string(line: &str) -> String {
        let mut out = Vec::new();
        handle_line(line, &mut out);
        String::from_utf8(out).expect("valid utf8")
    }

    #[test]
    fn malformed_line_yields_a_protocol_error_and_echoes_null_id() {
        let response = handle_to_string("not json");
        let value: serde_json::Value = serde_json::from_str(&response).unwrap();
        assert_eq!(value["ok"], serde_json::Value::Bool(false));
        assert_eq!(value["error"]["kind"], "protocol");
        assert!(value["id"].is_null());
    }

    #[test]
    fn request_id_is_echoed_on_success() {
        let cwd = std::env::temp_dir().to_string_lossy().into_owned();
        let line = format!(
            r#"{{"id":7,"command":"printf ok","cwd":"{cwd}"}}"#
        );
        let value: serde_json::Value = serde_json::from_str(&handle_to_string(&line)).unwrap();
        assert_eq!(value["id"], serde_json::json!(7));
        assert_eq!(value["ok"], serde_json::Value::Bool(true));
        assert_eq!(value["text"], "ok");
    }

    #[test]
    fn request_id_is_echoed_on_failure() {
        let line = r#"{"id":"a","command":"echo x","cwd":"/definitely/not/here"}"#;
        let value: serde_json::Value = serde_json::from_str(&handle_to_string(line)).unwrap();
        assert_eq!(value["id"], serde_json::json!("a"));
        assert_eq!(value["ok"], serde_json::Value::Bool(false));
    }
}
