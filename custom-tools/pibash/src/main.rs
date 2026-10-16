//! pibash — native shell-output pipeline for the pi agent.
//!
//! The built-in bash tool (TypeScript, `dist/core/tools/bash.js`) is the
//! oracle: this crate owns spawn + streaming + capping + truncation + spill +
//! envelope. The extension layer owns the session-sensitive parts (env and
//! PI_* injection, cancellation, TUI renderers).

mod accumulator;
mod cli;
mod envelope;
mod render;
mod runner;
mod serve;
mod truncate;

use std::io::Write;
use std::process::ExitCode;

use accumulator::OutputAccumulator;
use cli::{Mode, Request};
use envelope::Success;
use render::{format_output, structured_limit};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match cli::parse(&args) {
        Ok(Mode::Version) => {
            println!("pibash {VERSION}");
            ExitCode::SUCCESS
        }
        Ok(Mode::Help) => {
            println!("{}", cli::USAGE);
            ExitCode::SUCCESS
        }
        Ok(Mode::Serve) => match serve::run() {
            Ok(()) => ExitCode::SUCCESS,
            Err(message) => {
                eprintln!("pibash --serve: {message}");
                ExitCode::from(3)
            }
        },
        Ok(Mode::OneShot(request)) => one_shot(&request),
        Err(message) => {
            eprintln!("{message}\n{}", cli::USAGE);
            ExitCode::from(2)
        }
    }
}

/// Execute one request and print the envelope. Exit 0 on a completed run
/// (even a non-zero shell exit — the caller reads `exit_code`), 3 on a
/// spawn/IO failure.
fn one_shot(request: &Request) -> ExitCode {
    let response = execute(request);
    let (json, ok) = match &response {
        Ok(success) => (serde_json::to_string(success).unwrap_or_default(), true),
        Err(failure) => (serde_json::to_string(failure).unwrap_or_default(), false),
    };
    let mut stdout = std::io::stdout();
    let _ = writeln!(stdout, "{json}");
    let _ = stdout.flush();
    if ok {
        ExitCode::SUCCESS
    } else {
        ExitCode::from(3)
    }
}

/// The whole pipeline for one request: spawn → collect → cap → envelope.
pub fn execute(request: &Request) -> Result<Success, envelope::Failure> {
    execute_with(request, false)
}

/// `omit_truncation_content`: daemon-only wire dedup (see the call site).
pub fn execute_with(
    request: &Request,
    omit_truncation_content: bool,
) -> Result<Success, envelope::Failure> {
    let mut accumulator = OutputAccumulator::new("pi-output");
    let outcome = runner::run(request, &mut accumulator);
    accumulator.finish();

    if let Some(message) = outcome.spawn_error {
        let snapshot = accumulator.snapshot(false);
        let (text, _) = format_output(&mut accumulator, &snapshot, "");
        let detail = if text.trim().is_empty() {
            message
        } else {
            format!("{text}\n\n{message}")
        };
        return Err(envelope::failure("spawn", detail));
    }
    if outcome.timed_out {
        let snapshot = accumulator.snapshot(false);
        let (text, _) = format_output(&mut accumulator, &snapshot, "");
        let secs = request.timeout_seconds.unwrap_or_default();
        let status = format!("Command timed out after {secs} seconds");
        return Err(envelope::failure(
            "timeout",
            render::append_status(&text, &status),
        ));
    }
    let Some(exit_code) = outcome.exit_code else {
        return Err(envelope::failure(
            "io",
            "Command terminated without an exit code",
        ));
    };

    let snapshot = accumulator.snapshot(true);
    let (text, mut truncation) = format_output(&mut accumulator, &snapshot, "(no output)");
    // `truncation.content` is always an exact prefix of `text` (the note is
    // appended after it), so the daemon re-sends the same bytes twice. Drop the
    // copy on the wire; the extension restores it from `text`. The one-shot CLI
    // keeps it so crate/CLI consumers see a self-contained envelope.
    if omit_truncation_content
        && let Some(t) = truncation.as_mut()
    {
        t.content = String::new();
    }
    let last_line_bytes = accumulator.last_line_bytes();
    let (structured_output, structured_truncated) =
        accumulator.read_full_output(structured_limit());
    let full_output_path = snapshot
        .full_output_path
        .as_ref()
        .map(|path| path.to_string_lossy().into_owned());

    Ok(Success {
        ok: true,
        text,
        truncated: snapshot.truncation.truncated,
        full_output_path,
        exit_code,
        wall_time_seconds: outcome.wall_time_seconds,
        structured_output,
        structured_truncated,
        truncation,
        last_line_bytes,
    })
}
