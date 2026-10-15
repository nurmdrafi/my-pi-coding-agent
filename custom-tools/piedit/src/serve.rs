//! Daemon mode (`piedit --serve`): newline-delimited JSON over stdio.
//!
//! Protocol: each stdin line is one JSON request; each request produces
//! exactly one response line on stdout — the same envelope the one-shot CLI
//! prints, prefixed with the echoed request `id`. The extension keeps one
//! daemon alive across edit calls to amortize the process-spawn cost (the
//! dominant per-call overhead per the Step 6 micro-bench); stdin EOF — parent
//! exit, closed pipe — terminates the daemon cleanly.
//!
//! Requests are processed serially in arrival order; the `id` echo lets the
//! client match responses under concurrency. Request failures are per-line
//! error envelopes (never process failures); only transport loss (crash,
//! EOF) is a client-side failure, and the extension's fail-open ladder
//! (one-shot spawn → built-in) covers it.

use std::io::{self, BufRead, Write};
use std::process::ExitCode;

use serde::Deserialize;
use serde_json::Value;

use crate::ToolError;
use crate::envelope::{ErrorKind, write_fail_with_id, write_success_with_id};
use crate::pipeline;

/// One request line. Unknown fields are ignored (liberal in what we accept);
/// `id` is echoed verbatim so the client can use any JSON value.
#[derive(Deserialize)]
struct Request {
    id: Value,
    path: String,
    /// Absolute path I/O acts on (the extension resolves against ctx.cwd).
    /// Absent = use `path` verbatim (one-shot CLI compatibility).
    resolved: Option<String>,
    edits: Vec<crate::envelope::Edit>,
}

/// Serve until stdin EOF or an unwritable stdout (parent gone). Always exits
/// 0: per-request failures are error envelopes, not process failures.
pub fn serve() -> ExitCode {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = stdout.lock();
    // One response buffer reused across requests (capacity ratchets to the
    // largest response seen): serialize in place, append the newline, emit
    // with a single write — no per-response String, no re-growth.
    let mut buf = Vec::with_capacity(16 * 1024);
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break }; // unreadable stdin: treat as EOF
        if line.trim().is_empty() {
            continue;
        }
        buf.clear();
        respond_into(&line, &mut buf);
        buf.push(b'\n');
        if out.write_all(&buf).and_then(|_| out.flush()).is_err() {
            break; // stdout closed: parent went away, same as EOF
        }
    }
    ExitCode::SUCCESS
}

/// Parse one request line into a response written to `buf`.
fn respond_into(line: &str, buf: &mut Vec<u8>) {
    // Two-stage parse so malformed requests can still echo their id back.
    let value: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(err) => return protocol_error(None, &format!("not JSON: {err}"), buf),
    };
    let id = value.get("id").cloned();
    match serde_json::from_value::<Request>(value) {
        Ok(req) => handle_into(&req, buf),
        Err(err) => protocol_error(id.as_ref(), &format!("bad request: {err}"), buf),
    }
}

/// Run one well-formed request through the same pipeline as one-shot mode.
fn handle_into(req: &Request, buf: &mut Vec<u8>) {
    if req.edits.is_empty() {
        return write_fail_with_id(
            buf,
            Some(&req.id),
            &ToolError {
                kind: ErrorKind::Usage,
                message: "edits must contain at least one replacement".into(),
            },
        );
    }
    let resolved = req.resolved.as_deref().unwrap_or(&req.path);
    match pipeline::edit_file(&req.path, resolved, &req.edits) {
        Ok(applied) => {
            write_success_with_id(buf, Some(&req.id), &applied.base_content, &applied.new_content);
        }
        Err(err) => write_fail_with_id(buf, Some(&req.id), &err),
    }
}

fn protocol_error(id: Option<&Value>, message: &str, buf: &mut Vec<u8>) {
    write_fail_with_id(
        buf,
        id,
        &ToolError {
            kind: ErrorKind::Protocol,
            message: message.to_string(),
        },
    );
}
