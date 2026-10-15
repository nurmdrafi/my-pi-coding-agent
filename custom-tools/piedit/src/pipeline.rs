//! Match + apply + write pipeline, mirroring pi's `dist/core/tools/edit-diff.js`
//! and the built-in `edit` executor byte-for-byte on the observable surface:
//! the final file bytes, the `{baseContent, newContent}` pair handed back over
//! the envelope, and every error `message`.
//!
//! Normalization rules (from edit-diff.js):
//!   - `normalizeToLF`: `\r\n` → `\n`, then lone `\r` → `\n`.
//!   - `normalizeForFuzzyMatch`: NFKC, then per-line `trimEnd`, then smart
//!     quotes → ASCII, dashes → `-`, special spaces → ` `.
//!   - Exact match (`str::find`) is tried before the fuzzy path.
//!
//! Deviation note (intentional): JS `String.prototype.trimEnd` trims the
//! Unicode `WhiteSpace` + `LineTerminator` set, while Rust
//! `char::is_whitespace` is the `White_Space` property. Both agree on every
//! code point that appears in practice; the parity oracle in
//! `tests/piedit-parity.test.mjs` is the arbiter (spec R2).
//!
//! Write semantics (spec R4): the built-in calls
//! `fs.writeFile(path, content, "utf-8")` — a non-atomic truncate+write.
//! piedit mirrors that exactly (no temp-file+rename); same-path serialization
//! stays on the extension's `withFileMutationQueue`.

use std::fs;
use std::io;
use std::path::Path;

use unicode_normalization::UnicodeNormalization;

use crate::ToolError;
use crate::envelope::ErrorKind;

/// A matched replacement, in normalized-content space.
#[derive(Debug, Clone)]
struct MatchedEdit {
    edit_index: usize,
    match_index: usize,
    match_length: usize,
    new_text: String,
}

/// Outcome of a successful apply: the LF-normalized base and result.
#[derive(Debug)]
pub struct Applied {
    pub base_content: String,
    pub new_content: String,
}

// ---- normalization ----

/// Mirror `normalizeToLF`.
pub fn normalize_to_lf(text: &str) -> String {
    if !text.contains('\r') {
        return text.to_string();
    }
    // `\r\n` → `\n`, then any remaining lone `\r` → `\n`.
    text.replace("\r\n", "\n").replace('\r', "\n")
}

/// Mirror `restoreLineEndings`.
pub fn restore_line_endings(text: &str, ending: &str) -> String {
    if ending == "\r\n" {
        text.replace('\n', "\r\n")
    } else {
        text.to_string()
    }
}

/// Mirror `detectLineEnding`.
pub fn detect_line_ending(content: &str) -> &'static str {
    let lf = content.find('\n');
    let Some(lf) = lf else { return "\n" };
    match content.find("\r\n") {
        None => "\n",
        Some(crlf) if crlf < lf => "\r\n",
        Some(_) => "\n",
    }
}

/// Split `text` into a leading BOM (if present) and the rest.
/// Mirror of `splitBom` (`utils/text.js`).
pub fn split_bom(content: &str) -> (&str, &str) {
    match content.strip_prefix('\u{feff}') {
        Some(rest) => ("\u{feff}", rest),
        None => ("", content),
    }
}

/// Mirror the tail of `normalizeForFuzzyMatch` applied to a single line:
/// JS `trimEnd` followed by the smart-quote/dash/space substitutions that are
/// not order-sensitive across a single line.
fn fuzzy_line(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    for ch in line.trim_end().chars() {
        out.push(match ch {
            '\u{2018}' | '\u{2019}' | '\u{201A}' | '\u{201B}' => '\'',
            '\u{201C}' | '\u{201D}' | '\u{201E}' | '\u{201F}' => '"',
            '\u{2010}' | '\u{2011}' | '\u{2012}' | '\u{2013}' | '\u{2014}' | '\u{2015}'
            | '\u{2212}' => '-',
            '\u{00A0}' | '\u{2002}'..='\u{200A}' | '\u{202F}' | '\u{205F}' | '\u{3000}' => ' ',
            other => other,
        });
    }
    out
}

/// Mirror `normalizeForFuzzyMatch`: NFKC, per-line `trimEnd`, then the
/// smart-quote / dash / special-space substitutions.
pub fn normalize_for_fuzzy_match(text: &str) -> String {
    let nfkc: String = text.nfkc().collect();
    // Per-line trimEnd, preserving the `\n` separators exactly as JS's
    // `split("\n").map(trimEnd).join("\n")` does.
    let mut out = String::with_capacity(nfkc.len());
    let mut first = true;
    for line in nfkc.split('\n') {
        if !first {
            out.push('\n');
        }
        first = false;
        out.push_str(&fuzzy_line(line));
    }
    out
}

// ---- matching ----

struct MatchResult {
    found: bool,
    index: usize,
    match_length: usize,
    used_fuzzy: bool,
}

/// Mirror `fuzzyFindText`: exact `indexOf` first, else fuzzy.
fn fuzzy_find_text(content: &str, old_text: &str) -> MatchResult {
    if let Some(index) = content.find(old_text) {
        return MatchResult {
            found: true,
            index,
            match_length: old_text.len(),
            used_fuzzy: false,
        };
    }
    let fuzzy_content = normalize_for_fuzzy_match(content);
    let fuzzy_old = normalize_for_fuzzy_match(old_text);
    match fuzzy_content.find(&fuzzy_old) {
        Some(index) => MatchResult {
            found: true,
            index,
            match_length: fuzzy_old.len(),
            used_fuzzy: true,
        },
        None => MatchResult {
            found: false,
            index: 0,
            match_length: 0,
            used_fuzzy: false,
        },
    }
}

/// Mirror `countOccurrences`: count of non-overlapping splits in fuzzy space.
fn count_occurrences(content: &str, old_text: &str) -> usize {
    let fuzzy_content = normalize_for_fuzzy_match(content);
    let fuzzy_old = normalize_for_fuzzy_match(old_text);
    if fuzzy_old.is_empty() {
        // JS: "abc".split("").length - 1 == len; normalizeForFuzzyMatch("")
        // yields "" so split("") splits per char. We never reach here with an
        // empty oldText (guarded earlier), but keep JS semantics.
        return fuzzy_content.chars().count() + 1;
    }
    fuzzy_content.matches(&fuzzy_old).count()
}

// ---- error builders (byte-identical to edit-diff.js) ----

fn not_found_error(path: &str, edit_index: usize, total: usize) -> ToolError {
    let message = if total == 1 {
        format!(
            "Could not find the exact text in {path}. The old text must match exactly including all whitespace and newlines."
        )
    } else {
        format!(
            "Could not find edits[{edit_index}] in {path}. The oldText must match exactly including all whitespace and newlines."
        )
    };
    ToolError { kind: ErrorKind::NotFound, message }
}

fn duplicate_error(path: &str, edit_index: usize, total: usize, occurrences: usize) -> ToolError {
    let message = if total == 1 {
        format!(
            "Found {occurrences} occurrences of the text in {path}. The text must be unique. Please provide more context to make it unique."
        )
    } else {
        format!(
            "Found {occurrences} occurrences of edits[{edit_index}] in {path}. Each oldText must be unique. Please provide more context to make it unique."
        )
    };
    ToolError { kind: ErrorKind::Duplicate, message }
}

fn empty_old_text_error(path: &str, edit_index: usize, total: usize) -> ToolError {
    let message = if total == 1 {
        format!("oldText must not be empty in {path}.")
    } else {
        format!("edits[{edit_index}].oldText must not be empty in {path}.")
    };
    ToolError { kind: ErrorKind::EmptyOldText, message }
}

fn no_change_error(path: &str, total: usize) -> ToolError {
    let message = if total == 1 {
        format!(
            "No changes made to {path}. The replacement produced identical content. This might indicate an issue with special characters or the text not existing as expected."
        )
    } else {
        format!("No changes made to {path}. The replacements produced identical content.")
    };
    ToolError { kind: ErrorKind::NoChange, message }
}

// ---- line-span helpers (applyReplacementsPreservingUnchangedLines) ----

/// Split into `[^\n]*\n|[^\n]+` chunks — the JS `splitLinesWithEndings` regex.
fn split_lines_with_endings(content: &str) -> Vec<&str> {
    let bytes = content.as_bytes();
    let mut out = Vec::new();
    let mut start = 0;
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\n' {
            out.push(&content[start..i + 1]);
            i += 1;
            start = i;
        } else {
            i += 1;
        }
    }
    if start < bytes.len() {
        out.push(&content[start..]);
    }
    out
}

struct Span {
    start: usize,
    end: usize,
}

fn get_line_spans(content: &str) -> Vec<Span> {
    let mut offset = 0;
    split_lines_with_endings(content)
        .into_iter()
        .map(|line| {
            let span = Span { start: offset, end: offset + line.len() };
            offset = span.end;
            span
        })
        .collect()
}

fn get_replacement_line_range(
    lines: &[Span],
    match_index: usize,
    match_length: usize,
) -> Result<(usize, usize), ToolError> {
    let replacement_start = match_index;
    let replacement_end = match_index + match_length;
    let mut start_line: Option<usize> = None;
    for (i, line) in lines.iter().enumerate() {
        if replacement_start >= line.start && replacement_start < line.end {
            start_line = Some(i);
            break;
        }
    }
    let Some(start_line) = start_line else {
        return Err(ToolError {
            kind: ErrorKind::Io,
            message: "Replacement range is outside the base content.".into(),
        });
    };
    let mut end_line = start_line;
    while end_line < lines.len() && lines[end_line].end < replacement_end {
        end_line += 1;
    }
    if end_line >= lines.len() {
        return Err(ToolError {
            kind: ErrorKind::Io,
            message: "Replacement range is outside the base content.".into(),
        });
    }
    Ok((start_line, end_line + 1))
}

fn apply_replacements(
    content: &str,
    replacements: &[MatchedEdit],
    offset: usize,
) -> Result<String, ToolError> {
    let mut result = content.to_string();
    for replacement in replacements.iter().rev() {
        let match_index = replacement
            .match_index
            .checked_sub(offset)
            .ok_or_else(non_char_boundary)?;
        let end = match_index
            .checked_add(replacement.match_length)
            .ok_or_else(non_char_boundary)?;
        if match_index > result.len() || end > result.len() {
            return Err(non_char_boundary());
        }
        if !result.is_char_boundary(match_index) || !result.is_char_boundary(end) {
            return Err(non_char_boundary());
        }
        result.replace_range(match_index..end, &replacement.new_text);
    }
    Ok(result)
}

fn non_char_boundary() -> ToolError {
    // Interior mutations only touch ranges the matcher produced, always on
    // char boundaries; reaching here means index arithmetic drifted (a bug).
    ToolError {
        kind: ErrorKind::Io,
        message: "Replacement range is outside the base content.".into(),
    }
}

/// Mirror `applyReplacementsPreservingUnchangedLines`.
fn apply_replacements_preserving_unchanged_lines(
    original_content: &str,
    base_content: &str,
    replacements: &[MatchedEdit],
) -> Result<String, ToolError> {
    let original_lines = split_lines_with_endings(original_content);
    let base_lines = get_line_spans(base_content);
    if original_lines.len() != base_lines.len() {
        return Err(ToolError {
            kind: ErrorKind::Io,
            message: "Cannot preserve unchanged lines because the base content has a different line count."
                .into(),
        });
    }
    let mut sorted: Vec<&MatchedEdit> = replacements.iter().collect();
    sorted.sort_by_key(|r| r.match_index);

    struct Group {
        start_line: usize,
        end_line: usize,
        replacements: Vec<MatchedEdit>,
    }
    let mut groups: Vec<Group> = Vec::new();
    for replacement in sorted {
        let (start_line, end_line) =
            get_replacement_line_range(&base_lines, replacement.match_index, replacement.match_length)?;
        if let Some(current) = groups.last_mut()
            && start_line < current.end_line
        {
            current.end_line = current.end_line.max(end_line);
            current.replacements.push(replacement.clone());
            continue;
        }
        groups.push(Group {
            start_line,
            end_line,
            replacements: vec![replacement.clone()],
        });
    }

    let mut original_line_index = 0;
    let mut result = String::new();
    for group in &groups {
        for line in original_lines.iter().take(group.start_line).skip(original_line_index) {
            result.push_str(line);
        }
        let group_start = base_lines[group.start_line].start;
        let group_end = base_lines[group.end_line - 1].end;
        let slice = base_content
            .get(group_start..group_end)
            .ok_or_else(non_char_boundary)?;
        result.push_str(&apply_replacements(slice, &group.replacements, group_start)?);
        original_line_index = group.end_line;
    }
    for line in original_lines.iter().skip(original_line_index) {
        result.push_str(line);
    }
    Ok(result)
}

// ---- the pipeline entry ----

/// Mirror `applyEditsToNormalizedContent`.
pub fn apply_edits(normalized_content: &str, edits: &[crate::envelope::Edit], path: &str) -> Result<Applied, ToolError> {
    let normalized: Vec<(String, String)> = edits
        .iter()
        .map(|e| (normalize_to_lf(&e.old_text), normalize_to_lf(&e.new_text)))
        .collect();

    for (i, (old_text, _)) in normalized.iter().enumerate() {
        if old_text.is_empty() {
            return Err(empty_old_text_error(path, i, normalized.len()));
        }
    }

    // `initialMatches` decides whether ANY edit needs the fuzzy view; the
    // offsets themselves are recomputed below against the chosen base.
    let used_fuzzy_match = normalized
        .iter()
        .any(|(old_text, _)| fuzzy_find_text(normalized_content, old_text).used_fuzzy);

    let replacement_base_content = if used_fuzzy_match {
        normalize_for_fuzzy_match(normalized_content)
    } else {
        normalized_content.to_string()
    };

    let mut matched_edits: Vec<MatchedEdit> = Vec::with_capacity(normalized.len());
    for (i, (old_text, new_text)) in normalized.iter().enumerate() {
        let match_result = fuzzy_find_text(&replacement_base_content, old_text);
        if !match_result.found {
            return Err(not_found_error(path, i, normalized.len()));
        }
        let occurrences = count_occurrences(&replacement_base_content, old_text);
        if occurrences > 1 {
            return Err(duplicate_error(path, i, normalized.len(), occurrences));
        }
        matched_edits.push(MatchedEdit {
            edit_index: i,
            match_index: match_result.index,
            match_length: match_result.match_length,
            new_text: new_text.clone(),
        });
    }

    matched_edits.sort_by_key(|m| m.match_index);
    for i in 1..matched_edits.len() {
        let previous = &matched_edits[i - 1];
        let current = &matched_edits[i];
        if previous.match_index + previous.match_length > current.match_index {
            return Err(ToolError {
                kind: ErrorKind::Overlap,
                message: format!(
                    "edits[{}] and edits[{}] overlap in {path}. Merge them into one edit or target disjoint regions.",
                    previous.edit_index, current.edit_index
                ),
            });
        }
    }

    let base_content = normalized_content;
    let new_content = if used_fuzzy_match {
        apply_replacements_preserving_unchanged_lines(
            normalized_content,
            &replacement_base_content,
            &matched_edits,
        )?
    } else {
        apply_replacements(&replacement_base_content, &matched_edits, 0)?
    };

    if base_content == new_content {
        return Err(no_change_error(path, normalized.len()));
    }

    Ok(Applied {
        base_content: base_content.to_string(),
        new_content,
    })
}

/// Node-style error code strings (`error.code`), which is what the built-in's
/// `access` catch interpolates as `Error code: ${code}`.
fn node_code(err: &io::Error) -> &'static str {
    match err.kind() {
        io::ErrorKind::NotFound => "ENOENT",
        io::ErrorKind::PermissionDenied => "EACCES",
        io::ErrorKind::AlreadyExists => "EEXIST",
        io::ErrorKind::InvalidInput => "EINVAL",
        _ => match err.raw_os_error() {
            Some(20) => "ENOTDIR",
            Some(21) => "EISDIR",
            Some(28) => "ENOSPC",
            Some(30) => "EROFS",
            Some(40) => "ELOOP",
            Some(36) => "ENAMETOOLONG",
            _ => "UNKNOWN",
        },
    }
}

/// Map an I/O error to the envelope kind, mirroring the built-in's codes.
fn io_kind(err: &io::Error) -> ErrorKind {
    match node_code(err) {
        "ENOENT" => ErrorKind::Enoent,
        "EACCES" => ErrorKind::Eacces,
        "ENOTDIR" => ErrorKind::Enotdir,
        _ => ErrorKind::Io,
    }
}

/// The built-in's `access` catch wrapper: `Could not edit file: <path>.
/// Error code: <CODE>.` — Node interpolates the *string* code, not the errno.
fn access_error(path: &str, err: &io::Error) -> ToolError {
    ToolError {
        kind: io_kind(err),
        message: format!("Could not edit file: {path}. Error code: {}.", node_code(err)),
    }
}

/// Read the target, apply `edits`, write the result back with the built-in's
/// exact write semantics, and return the `{baseContent, newContent}` pair.
///
/// `path` is the tool-level path exactly as the caller supplied it (used in
/// every error message, matching the built-in); `resolved` is the absolute
/// path I/O acts on (the built-in resolves against `ctx.cwd`).
pub fn edit_file(path: &str, resolved: &str, edits: &[crate::envelope::Edit]) -> Result<Applied, ToolError> {
    let p = Path::new(resolved);

    // `access(R_OK | W_OK)` — only this step is wrapped in the
    // `Could not edit file:` prefix; read/write failures propagate raw.
    if let Err(err) = check_access(p) {
        return Err(access_error(path, &err));
    }

    // The built-in reads with `ops.readFile` and lets the Node error surface
    // unwrapped (e.g. `EISDIR: illegal operation on a directory, read`).
    let meta = fs::metadata(p).map_err(raw_io_error)?;
    if meta.is_dir() {
        return Err(ToolError {
            kind: ErrorKind::Io,
            message: "EISDIR: illegal operation on a directory, read".into(),
        });
    }
    let raw_bytes = fs::read(p).map_err(raw_io_error)?;
    let raw_content = String::from_utf8_lossy(&raw_bytes);
    let (bom, content) = split_bom(&raw_content);
    let original_ending = detect_line_ending(content).to_string();
    let normalized_content = normalize_to_lf(content);

    let applied = apply_edits(&normalized_content, edits, path)?;

    let final_content = format!("{bom}{}", restore_line_endings(&applied.new_content, &original_ending));
    // Mirror `fs.writeFile(path, content, "utf-8")` — no temp-file+rename.
    fs::write(p, final_content.as_bytes()).map_err(raw_io_error)?;

    Ok(applied)
}

/// Raw Node-style I/O message (read/write path): `<CODE>: <libuv message>`.
fn raw_io_error(err: io::Error) -> ToolError {
    ToolError {
        kind: io_kind(&err),
        message: node_io_message(&err),
    }
}

/// Best-effort reproduction of Node's `libuv` error string for the codes the
/// edit pipeline can hit. The exact wording matters for the read/write paths
/// (which propagate unwrapped); the parity oracle is the arbiter.
fn node_io_message(err: &io::Error) -> String {
    let code = node_code(err);
    let detail = match code {
        "ENOENT" => "no such file or directory",
        "EACCES" => "permission denied",
        "EISDIR" => "illegal operation on a directory",
        "ENOTDIR" => "not a directory",
        "ENOSPC" => "no space left on device",
        "EROFS" => "read-only file system",
        "ELOOP" => "too many symbolic links encountered",
        "ENAMETOOLONG" => "name too long",
        _ => "unknown error",
    };
    format!("{code}: {detail}")
}

fn check_access(p: &Path) -> io::Result<()> {
    // The built-in calls `access(R_OK | W_OK)`; on POSIX a directory passes
    // that (it is readable+writable), so a directory reaches the read step
    // and fails EISDIR there. Mirror by accepting directories here.
    fs::metadata(p).map(|_| ())
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::envelope::Edit;

    fn edit(old: &str, new: &str) -> Edit {
        Edit { old_text: old.into(), new_text: new.into() }
    }

    fn apply(content: &str, edits: &[Edit]) -> Result<Applied, ToolError> {
        apply_edits(&normalize_to_lf(content), edits, "/tmp/f")
    }

    #[test]
    fn exact_single_edit() {
        let r = apply("alpha\nbeta\ngamma\n", &[edit("beta", "BETA")]).unwrap();
        assert_eq!(r.base_content, "alpha\nbeta\ngamma\n");
        assert_eq!(r.new_content, "alpha\nBETA\ngamma\n");
    }

    #[test]
    fn multi_disjoint_reverse_apply() {
        let r = apply("a\nb\nc\nd\n", &[edit("a", "A"), edit("d", "D")]).unwrap();
        assert_eq!(r.new_content, "A\nb\nc\nD\n");
    }

    #[test]
    fn empty_old_text_error_message() {
        let err = apply("x\n", &[edit("", "y")]).unwrap_err();
        assert_eq!(err.message, "oldText must not be empty in /tmp/f.");
        assert_eq!(err.kind, ErrorKind::EmptyOldText);
        let err = apply("x\n", &[edit("x", "y"), edit("", "z")]).unwrap_err();
        assert_eq!(err.message, "edits[1].oldText must not be empty in /tmp/f.");
    }

    #[test]
    fn not_found_error_messages() {
        let err = apply("x\n", &[edit("zzz", "y")]).unwrap_err();
        assert_eq!(
            err.message,
            "Could not find the exact text in /tmp/f. The old text must match exactly including all whitespace and newlines."
        );
        let err = apply("x\n", &[edit("x", "y"), edit("zzz", "w")]).unwrap_err();
        assert_eq!(
            err.message,
            "Could not find edits[1] in /tmp/f. The oldText must match exactly including all whitespace and newlines."
        );
    }

    #[test]
    fn duplicate_error_messages() {
        let err = apply("x\nx\n", &[edit("x", "y")]).unwrap_err();
        assert_eq!(
            err.message,
            "Found 2 occurrences of the text in /tmp/f. The text must be unique. Please provide more context to make it unique."
        );
        let err = apply("x\nx\n", &[edit("x\nx", "y"), edit("x", "z")]).unwrap_err();
        assert_eq!(
            err.message,
            "Found 2 occurrences of edits[1] in /tmp/f. Each oldText must be unique. Please provide more context to make it unique."
        );
    }

    #[test]
    fn overlap_error_message() {
        let err = apply("abcdef\n", &[edit("abc", "X"), edit("bcd", "Y")]).unwrap_err();
        assert_eq!(
            err.message,
            "edits[0] and edits[1] overlap in /tmp/f. Merge them into one edit or target disjoint regions."
        );
        assert_eq!(err.kind, ErrorKind::Overlap);
    }

    #[test]
    fn no_change_error_messages() {
        let err = apply("x\n", &[edit("x", "x")]).unwrap_err();
        assert_eq!(
            err.message,
            "No changes made to /tmp/f. The replacement produced identical content. This might indicate an issue with special characters or the text not existing as expected."
        );
        let err = apply("x\ny\n", &[edit("x", "x"), edit("y", "y")]).unwrap_err();
        assert_eq!(
            err.message,
            "No changes made to /tmp/f. The replacements produced identical content."
        );
        assert_eq!(err.kind, ErrorKind::NoChange);
    }

    #[test]
    fn fuzzy_trailing_whitespace_preserves_untouched_lines() {
        // `"  target"` matches exactly (index 10), so this takes the exact-apply
        // path: the matched line's trailing whitespace survives verbatim.
        let content = "keep me  \n  target  \nkeep me too  \n";
        let r = apply(content, &[edit("  target", "target!")]).unwrap();
        assert_eq!(r.new_content, "keep me  \ntarget!  \nkeep me too  \n");
    }

    #[test]
    fn fuzzy_path_preserves_untouched_originals() {
        // The oldText has no exact match (trailing whitespace differs), so the
        // operation runs in fuzzy space: untouched lines are copied from the
        // ORIGINAL bytes (trailing spaces kept); the touched line is rewritten
        // from the normalized base.
        let content = "keep me  \ntarget\nkeep me too  \n";
        let r = apply(content, &[edit("target   ", "TARGET")]).unwrap();
        assert_eq!(r.new_content, "keep me  \nTARGET\nkeep me too  \n");
    }

    #[test]
    fn fuzzy_smart_quotes_and_dashes() {
        let content = "say \u{201C}hi\u{201D} \u{2013} done\n";
        let r = apply(content, &[edit("say \"hi\" - done", "said hi - done")]).unwrap();
        assert_eq!(r.new_content, "said hi - done\n");
    }

    #[test]
    fn nbsp_normalizes_to_space() {
        let content = "a\u{00A0}b\n";
        let r = apply(content, &[edit("a b", "a-b")]).unwrap();
        assert_eq!(r.new_content, "a-b\n");
    }

    #[test]
    fn nfkc_composed_decomposed() {
        // "é" precomposed (U+00E9) vs decomposed (e + U+0301).
        let content = "caf\u{00E9}\n";
        let r = apply(content, &[edit("cafe\u{0301}", "coffee")]).unwrap();
        assert_eq!(r.new_content, "coffee\n");
    }

    #[test]
    fn line_endings_and_bom_helpers() {
        assert_eq!(normalize_to_lf("a\r\nb\rc\n"), "a\nb\nc\n");
        assert_eq!(detect_line_ending("a\r\nb\r\n"), "\r\n");
        assert_eq!(detect_line_ending("a\nb\r\n"), "\n");
        assert_eq!(detect_line_ending("no newline"), "\n");
        assert_eq!(restore_line_endings("a\nb\n", "\r\n"), "a\r\nb\r\n");
        assert_eq!(restore_line_endings("a\nb\n", "\n"), "a\nb\n");
        assert_eq!(split_bom("\u{feff}x"), ("\u{feff}", "x"));
        assert_eq!(split_bom("x"), ("", "x"));
    }

    #[test]
    fn file_roundtrip_crlf_and_bom() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("crlf.txt");
        fs::write(&p, "\u{feff}one\r\ntwo\r\nthree\r\n").unwrap();
        let path = p.to_str().unwrap();
        let r = edit_file(path, path, &[edit("two", "TWO")]).unwrap();
        assert_eq!(r.base_content, "one\ntwo\nthree\n");
        assert_eq!(r.new_content, "one\nTWO\nthree\n");
        assert_eq!(fs::read_to_string(&p).unwrap(), "\u{feff}one\r\nTWO\r\nthree\r\n");
    }

    #[test]
    fn file_not_found() {
        let err = edit_file("/nonexistent/piedit/nope.txt", "/nonexistent/piedit/nope.txt", &[edit("a", "b")]).unwrap_err();
        assert_eq!(err.kind, ErrorKind::Enoent);
        assert_eq!(
            err.message,
            "Could not edit file: /nonexistent/piedit/nope.txt. Error code: ENOENT."
        );
    }

    #[test]
    fn directory_target_errors() {
        let dir = tempfile::tempdir().unwrap();
        let err = edit_file(dir.path().to_str().unwrap(), dir.path().to_str().unwrap(), &[edit("a", "b")]).unwrap_err();
        // The built-in calls access() (dirs pass) then readFile → EISDIR raw.
        assert!(
            err.message.starts_with("EISDIR: illegal operation on a directory"),
            "got: {}",
            err.message
        );
    }
}
