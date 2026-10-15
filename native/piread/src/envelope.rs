//! JSON envelope types — the wire contract between piread and the extension.
//!
//! Field order matches the spec (`ok` first) and names are camelCase so the
//! extension can forward values verbatim.

use serde::Serialize;

use crate::ToolError;

/// Truncation report mirroring the built-in `truncateHead` result object.
/// Rendered content sits in the top-level `content` field; this is the
/// `details.truncation` payload the extension forwards.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Truncation {
    pub content: String,
    pub truncated: bool,
    /// "lines" | "bytes" | null — serialized as a JSON string or null.
    pub truncated_by: Option<TruncationKind>,
    pub total_lines: u64,
    pub total_bytes: u64,
    pub output_lines: u64,
    pub output_bytes: u64,
    pub last_line_partial: bool,
    pub first_line_exceeds_limit: bool,
    pub max_lines: u64,
    pub max_bytes: u64,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub enum TruncationKind {
    #[serde(rename = "lines")]
    Lines,
    #[serde(rename = "bytes")]
    Bytes,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Success<'a> {
    ok: bool,
    content: &'a str,
    truncation: Option<&'a Truncation>,
    binary: bool,
    total_bytes: u64,
}

#[derive(Serialize)]
struct Failure<'a> {
    ok: bool,
    error: &'a ToolErrorBody<'a>,
}

#[derive(Serialize)]
struct ToolErrorBody<'a> {
    kind: &'a ErrorKind,
    message: &'a str,
}

/// Coarse failure family for observability; exact messages carry the detail.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub enum ErrorKind {
    #[serde(rename = "ENOENT")]
    Enoent,
    #[serde(rename = "EACCES")]
    Eacces,
    #[serde(rename = "EISDIR")]
    Eisdir,
    #[serde(rename = "io")]
    Io,
    #[serde(rename = "offset")]
    Offset,
}

impl ErrorKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ErrorKind::Enoent => "ENOENT",
            ErrorKind::Eacces => "EACCES",
            ErrorKind::Eisdir => "EISDIR",
            ErrorKind::Io => "io",
            ErrorKind::Offset => "offset",
        }
    }
}

pub fn success_envelope(
    content: &str,
    truncation: Option<&Truncation>,
    binary: bool,
    total_bytes: u64,
) -> String {
    let value = Success {
        ok: true,
        content,
        truncation,
        binary,
        total_bytes,
    };
    serde_json::to_string(&value).expect("success envelope serializes")
}

pub fn fail_envelope(err: &ToolError) -> String {
    let body = ToolErrorBody {
        kind: &err.kind,
        message: &err.message,
    };
    let value = Failure { ok: false, error: &body };
    serde_json::to_string(&value).expect("failure envelope serializes")
}
