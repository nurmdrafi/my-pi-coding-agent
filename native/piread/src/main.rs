//! piread — native read pipeline for the pi agent harness (S6).
//!
//! One invocation runs the whole text-read pipeline the built-in `read` tool
//! performs in TypeScript (open → slice → render → truncate) and prints a
//! single JSON envelope on stdout. Byte-for-byte parity with the built-in is
//! enforced by the oracle suite `tests/piread-parity.test.mjs` in the harness
//! repo; this crate owns the mechanics.
//!
//! Exit codes: 0 ok · 2 usage (stderr message, no JSON) · 3 I/O error (JSON).

use std::fmt;
use std::process::ExitCode;

mod cli;
mod envelope;

use cli::{parse_args, Parsed};
use envelope::{fail_envelope, ErrorKind, Truncation};

fn main() -> ExitCode {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    match parse_args(&argv) {
        Err(msg) => {
            eprintln!("piread: {msg}");
            eprintln!("usage: piread --path <P> [--offset <N>] [--limit <N>]  (try --help)");
            ExitCode::from(2)
        }
        Ok(Parsed::Help) => {
            print!("{}", cli::HELP);
            ExitCode::SUCCESS
        }
        Ok(Parsed::Version) => {
            println!("piread {}", env!("CARGO_PKG_VERSION"));
            ExitCode::SUCCESS
        }
        Ok(Parsed::Run(run)) => match run_pipeline(&run) {
            Ok((content, truncation, binary, total_bytes)) => {
                let out = envelope::success_envelope(&content, truncation.as_ref(), binary, total_bytes);
                println!("{out}");
                ExitCode::SUCCESS
            }
            Err(err) => {
                let out = fail_envelope(&err);
                println!("{out}");
                ExitCode::from(3)
            }
        },
    }
}

/// Placeholder pipeline (Step 1): whole-file lossy read, no slicing yet —
/// the streaming pipeline (offset/limit, truncateHead parity, binary detect)
/// lands in Step 2 and replaces this.
fn run_pipeline(run: &cli::Run) -> Result<(String, Option<Truncation>, bool, u64), ToolError> {
    let resolved = resolve_path(&run.path);
    let bytes = read_all(&resolved)?;
    let total = bytes.len() as u64;
    let content = String::from_utf8_lossy(&bytes).into_owned();
    Ok((content, None, false, total))
}

/// Resolve like the built-in's `resolveToCwd`: `~` expansion, then lexical
/// normalization against the process cwd. (The built-in's macOS screenshot
/// filename variants are covered by the extension's fail-open fallback.)
fn resolve_path(raw: &str) -> String {
    let expanded = if raw == "~" {
        std::env::var("HOME").unwrap_or_default()
    } else if let Some(rest) = raw.strip_prefix("~/") {
        format!("{}/{}", std::env::var("HOME").unwrap_or_default(), rest)
    } else {
        raw.to_string()
    };
    if expanded.starts_with('/') {
        normalize(&expanded)
    } else {
        let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("/"));
        normalize(&format!("{}/{}", cwd.to_string_lossy(), expanded))
    }
}

/// Lexical path cleanup: collapse `//`, `.`, and `..` segments (absolute only).
fn normalize(abs: &str) -> String {
    let mut out: Vec<&str> = Vec::new();
    for seg in abs.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                out.pop();
            }
            s => out.push(s),
        }
    }
    format!("/{}", out.join("/"))
}

fn read_all(resolved: &str) -> Result<Vec<u8>, ToolError> {
    use std::io::Read;
    let mut file = std::fs::File::open(resolved).map_err(|e| open_error(e, resolved))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).map_err(read_error)?;
    Ok(buf)
}

/// Node's `fsPromises.access(path, R_OK)` error messages, byte for byte.
fn open_error(e: std::io::Error, resolved: &str) -> ToolError {
    match e.kind() {
        std::io::ErrorKind::NotFound => ToolError {
            kind: ErrorKind::Enoent,
            message: format!("ENOENT: no such file or directory, access '{resolved}'"),
        },
        std::io::ErrorKind::PermissionDenied => ToolError {
            kind: ErrorKind::Eacces,
            message: format!("EACCES: permission denied, access '{resolved}'"),
        },
        _ => generic_io_error(e),
    }
}

fn read_error(e: std::io::Error) -> ToolError {
    if e.kind() == std::io::ErrorKind::IsADirectory {
        return ToolError {
            kind: ErrorKind::Eisdir,
            message: "EISDIR: illegal operation on a directory, read".to_string(),
        };
    }
    generic_io_error(e)
}

fn generic_io_error(e: std::io::Error) -> ToolError {
    ToolError {
        kind: ErrorKind::Io,
        message: format!("{e}, read"),
    }
}

/// Tool-level failure mapped to the JSON envelope (Step 1 stub; full kinds land in Step 2).
pub struct ToolError {
    pub kind: ErrorKind,
    pub message: String,
}

impl fmt::Display for ToolError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.kind.as_str(), self.message)
    }
}

#[cfg(test)]
mod tests {
    use crate::cli::{self, parse_args, Parsed};

    fn args(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    fn ok(v: &[&str]) -> cli::Run {
        match parse_args(&args(v)).expect("should parse") {
            Parsed::Run(r) => r,
            _ => panic!("expected Run"),
        }
    }

    #[test]
    fn parses_minimal_invocation() {
        let r = ok(&["--path", "/tmp/x"]);
        assert_eq!(r.path, "/tmp/x");
        assert_eq!(r.offset, None);
        assert_eq!(r.limit, None);
    }

    #[test]
    fn parses_full_invocation_and_equals_form() {
        let r = ok(&["--path", "/tmp/x", "--offset", "5", "--limit", "10"]);
        assert_eq!(r.offset, Some(5));
        assert_eq!(r.limit, Some(10));
        let r = ok(&["--path=/tmp/x", "--offset=7"]);
        assert_eq!(r.path, "/tmp/x");
        assert_eq!(r.offset, Some(7));
    }

    #[test]
    fn duplicate_flag_last_wins() {
        let r = ok(&["--path", "/a", "--path", "/b"]);
        assert_eq!(r.path, "/b");
    }

    #[test]
    fn rejects_offset_below_one() {
        assert!(parse_args(&args(&["--path", "/x", "--offset", "0"])).is_err());
        assert!(parse_args(&args(&["--path", "/x", "--offset", "-3"])).is_err());
    }

    #[test]
    fn rejects_limit_below_one() {
        assert!(parse_args(&args(&["--path", "/x", "--limit", "0"])).is_err());
        assert!(parse_args(&args(&["--path", "/x", "--limit", "-1"])).is_err());
    }

    #[test]
    fn rejects_non_numeric_and_garbled_values() {
        assert!(parse_args(&args(&["--path", "/x", "--offset", "abc"])).is_err());
        assert!(parse_args(&args(&["--path", "/x", "--offset", "1.5"])).is_err());
        assert!(parse_args(&args(&["--path", "/x", "--offset"])).is_err());
    }

    #[test]
    fn rejects_unknown_flag_positional_and_missing_path() {
        assert!(parse_args(&args(&["--paths", "/x"])).is_err());
        assert!(parse_args(&args(&["--path", "/x", "extra"])).is_err());
        assert!(parse_args(&args(&[])).is_err());
        assert!(parse_args(&args(&["--offset", "2"])).is_err());
    }

    #[test]
    fn recognizes_version_and_help() {
        assert!(matches!(parse_args(&args(&["--version"])).unwrap(), Parsed::Version));
        assert!(matches!(parse_args(&args(&["--help"])).unwrap(), Parsed::Help));
        // even alongside other flags (informational flags win)
        assert!(matches!(parse_args(&args(&["--path", "/x", "--version"])).unwrap(), Parsed::Version));
    }
}
