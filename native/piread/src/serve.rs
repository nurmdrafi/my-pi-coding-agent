//! Daemon mode (`piread --serve`): newline-delimited JSON over stdio.
//!
//! Protocol: each stdin line is one JSON request; each request produces
//! exactly one response line on stdout — the same envelope the one-shot CLI
//! prints, prefixed with the echoed request `id`. The extension keeps one
//! daemon alive across read calls to amortize the process-spawn cost (the
//! dominant per-call overhead, per the Step 6 micro-bench); stdin EOF —
//! parent exit, closed pipe — terminates the daemon cleanly.
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

use crate::envelope::{fail_envelope_with_id, success_envelope_with_id, ErrorKind};
use crate::pipeline;
use crate::ToolError;

/// One request line. Unknown fields are ignored (liberal in what we accept);
/// `id` is echoed verbatim so the client can use any JSON value.
#[derive(Deserialize)]
struct Request {
    id: Value,
    path: String,
    offset: Option<u64>,
    limit: Option<u64>,
    /// Directory relative paths resolve against (default: process cwd).
    cwd: Option<String>,
}

/// Serve until stdin EOF or an unwritable stdout (parent gone). Always exits
/// 0: per-request failures are error envelopes, not process failures.
pub fn serve() -> ExitCode {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = stdout.lock();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break }; // unreadable stdin: treat as EOF
        if line.trim().is_empty() {
            continue;
        }
        let response = respond(&line);
        if writeln!(out, "{response}").and_then(|_| out.flush()).is_err() {
            break; // stdout closed: parent went away, same as EOF
        }
    }
    ExitCode::SUCCESS
}

/// Parse one request line into a response line.
fn respond(line: &str) -> String {
    // Two-stage parse so malformed requests can still echo their id back.
    let value: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(err) => return protocol_error(None, &format!("not JSON: {err}")),
    };
    let id = value.get("id").cloned();
    match serde_json::from_value::<Request>(value) {
        Ok(req) => handle(&req),
        Err(err) => protocol_error(id.as_ref(), &format!("bad request: {err}")),
    }
}

/// Run one well-formed request through the same pipeline as one-shot mode.
fn handle(req: &Request) -> String {
    if let Some(err) = validate(req) {
        return fail_envelope_with_id(Some(&req.id), &err);
    }
    let base = req.cwd.clone().unwrap_or_else(|| {
        std::env::current_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("/"))
            .to_string_lossy()
            .into_owned()
    });
    let resolved = pipeline::resolve_path_against(&req.path, &base);
    match pipeline::read_text(&resolved, &req.path, req.offset, req.limit) {
        Ok(out) => success_envelope_with_id(
            Some(&req.id),
            &out.content,
            out.truncation.as_ref(),
            out.binary,
            out.total_bytes,
        ),
        Err(err) => fail_envelope_with_id(Some(&req.id), &err),
    }
}

/// Mirror the CLI contract: offset/limit, when present, are integers ≥ 1
/// (the extension screens the tool-level 0/negative/non-integer semantics to
/// the built-in before dispatching, so this is defense in depth).
fn validate(req: &Request) -> Option<ToolError> {
    for (name, value) in [("offset", req.offset), ("limit", req.limit)] {
        if value.is_some_and(|v| v == 0) {
            return Some(ToolError {
                kind: ErrorKind::Usage,
                message: format!("{name} must be an integer ≥ 1"),
            });
        }
    }
    None
}

fn protocol_error(id: Option<&Value>, message: &str) -> String {
    fail_envelope_with_id(
        id,
        &ToolError {
            kind: ErrorKind::Protocol,
            message: message.to_string(),
        },
    )
}
