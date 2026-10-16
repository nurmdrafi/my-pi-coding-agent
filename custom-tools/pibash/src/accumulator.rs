//! Bounded streaming output accumulator — port of `OutputAccumulator`.
//!
//! Keeps only a decoded tail in memory (`maxBytes * 2` rolling window, as the
//! oracle does), spills the full raw stream to a temp file the moment the
//! output can no longer fit, and produces the display snapshot + truncation.

use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};

use crate::truncate::{js_byte_length, truncate_tail, Truncation};

/// Streaming UTF-8 decoder — the port of `TextDecoder` with `{stream: true}`.
///
/// A multi-byte character can straddle two `read()` chunks, because a pipe
/// delivers whatever bytes are ready. The oracle's streaming decoder buffers the
/// incomplete trailing sequence until the next chunk, so the character decodes
/// once; a per-chunk `from_utf8_lossy` instead emitted a replacement character
/// per half of the character and corrupted the output. That was the largest
/// parity gap in the accumulator.
#[derive(Default)]
struct Utf8Stream {
    pending: [u8; 4],
    pending_len: usize,
}

impl Utf8Stream {
    fn is_clean(&self) -> bool {
        self.pending_len == 0
    }

    /// Append decoded text for `data`, buffering an incomplete trailing
    /// sequence (if any) for the next chunk.
    fn decode_into(&mut self, data: &[u8], out: &mut String) {
        if self.pending_len == 0 {
            self.decode_slice(data, out);
            return;
        }
        // A UTF-8 character is at most 4 bytes, so at most three leading bytes
        // of `data` are needed to complete the pending sequence.
        let needed = 4 - self.pending_len;
        let take = data.len().min(needed);
        let head_len = self.pending_len + take;
        let mut head = [0u8; 4];
        head[..self.pending_len].copy_from_slice(&self.pending[..self.pending_len]);
        head[self.pending_len..head_len].copy_from_slice(&data[..take]);
        self.pending_len = 0;
        self.decode_slice(&head[..head_len], out);
        self.decode_slice(&data[take..], out);
    }

    fn decode_slice(&mut self, bytes: &[u8], out: &mut String) {
        let mut rest = bytes;
        loop {
            match std::str::from_utf8(rest) {
                Ok(text) => {
                    out.push_str(text);
                    return;
                }
                Err(err) => {
                    // Everything before `valid_up_to` is known-good UTF-8.
                    out.push_str(std::str::from_utf8(&rest[..err.valid_up_to()]).unwrap_or(""));
                    match err.error_len() {
                        Some(len) => {
                            out.push(char::REPLACEMENT_CHARACTER);
                            rest = &rest[err.valid_up_to() + len..];
                        }
                        None => {
                            let leftover = &rest[err.valid_up_to()..];
                            debug_assert!(leftover.len() <= self.pending.len());
                            self.pending[..leftover.len()].copy_from_slice(leftover);
                            self.pending_len = leftover.len();
                            return;
                        }
                    }
                }
            }
        }
    }

    /// Flush an unfinished sequence as a single replacement character, matching
    /// `TextDecoder.decode()` at end of stream.
    fn finish_into(&mut self, out: &mut String) {
        if self.pending_len > 0 {
            out.push(char::REPLACEMENT_CHARACTER);
            self.pending_len = 0;
        }
    }
}

/// Built-in defaults (`dist/core/tools/truncate.js`).
pub const DEFAULT_MAX_LINES: usize = 2000;
pub const DEFAULT_MAX_BYTES: usize = 50 * 1024;

/// Snapshot handed to the renderer: display text + truncation + spill path.
pub struct Snapshot {
    pub content: String,
    pub truncation: Truncation,
    pub full_output_path: Option<PathBuf>,
}

/// Incremental accumulator over raw stdout/stderr chunks.
pub struct OutputAccumulator {
    max_lines: usize,
    max_bytes: usize,
    max_rolling_bytes: usize,
    temp_file_prefix: String,
    tail: String,
    tail_starts_at_line_boundary: bool,
    total_raw_bytes: usize,
    total_decoded_bytes: usize,
    completed_lines: usize,
    total_lines: usize,
    current_line_bytes: usize,
    has_open_line: bool,
    finished: bool,
    decoder: Utf8Stream,
    temp_file_path: Option<PathBuf>,
    temp_writer: Option<BufWriter<File>>,
    /// Raw bytes kept only while a spill file may still be needed. Held as one
    /// contiguous buffer: the previous `Vec<Vec<u8>>` shape made
    /// `read_full_output` concatenate every chunk into a second full copy.
    raw: Vec<u8>,
}

impl OutputAccumulator {
    #[must_use]
    pub fn new(temp_file_prefix: &str) -> Self {
        let max_lines = DEFAULT_MAX_LINES;
        let max_bytes = DEFAULT_MAX_BYTES;
        Self {
            max_lines,
            max_bytes,
            max_rolling_bytes: (max_bytes * 2).max(1),
            temp_file_prefix: temp_file_prefix.to_string(),
            tail: String::new(),
            tail_starts_at_line_boundary: true,
            total_raw_bytes: 0,
            total_decoded_bytes: 0,
            completed_lines: 0,
            total_lines: 0,
            current_line_bytes: 0,
            has_open_line: false,
            finished: false,
            decoder: Utf8Stream::default(),
            temp_file_path: None,
            temp_writer: None,
            raw: Vec::new(),
        }
    }

    /// Feed one raw chunk. UTF-8 is decoded with a streaming decoder, so a
    /// character split across two chunks decodes once instead of producing a
    /// replacement character per half (oracle parity).
    pub fn append(&mut self, data: &[u8]) {
        self.total_raw_bytes += data.len();
        // Fast path: nothing pending and the chunk is valid UTF-8 (the common
        // case), so decode in place with no temporary allocation.
        if self.decoder.is_clean()
            && let Ok(text) = std::str::from_utf8(data)
        {
            self.append_decoded_text(text);
        } else {
            let mut decoded = String::with_capacity(data.len() + 4);
            self.decoder.decode_into(data, &mut decoded);
            self.append_decoded_text(&decoded);
        }

        if self.temp_writer.is_some() || self.should_use_temp_file() {
            self.ensure_temp_file();
            if let Some(writer) = self.temp_writer.as_mut() {
                let _ = writer.write_all(data);
            }
        } else if !data.is_empty() {
            self.raw.extend_from_slice(data);
        }
    }

    /// Flush and close the spill writer.
    pub fn finish(&mut self) {
        if self.finished {
            return;
        }
        self.finished = true;
        // Flush any half-decoded character at end of stream, as the oracle's
        // streaming decoder does in `finish()`.
        let mut flushed = String::new();
        self.decoder.finish_into(&mut flushed);
        if !flushed.is_empty() {
            self.append_decoded_text(&flushed);
        }
        if self.should_use_temp_file() {
            self.ensure_temp_file();
        }
        if let Some(mut writer) = self.temp_writer.take() {
            let _ = writer.flush();
        }
    }

    /// Display snapshot: truncated tail, truncation metadata, spill path.
    pub fn snapshot(&mut self, persist_if_truncated: bool) -> Snapshot {
        let text = self.snapshot_text();
        let mut truncation = truncate_tail(&text, self.max_lines, self.max_bytes);
        let truncated =
            self.total_lines > self.max_lines || self.total_decoded_bytes > self.max_bytes;
        truncation.truncated = truncated;
        truncation.truncated_by = if truncated {
            truncation.truncated_by.or(Some(if self.total_decoded_bytes > self.max_bytes {
                "bytes"
            } else {
                "lines"
            }))
        } else {
            None
        };
        truncation.total_lines = self.total_lines;
        truncation.total_bytes = self.total_decoded_bytes;
        truncation.max_lines = self.max_lines;
        truncation.max_bytes = self.max_bytes;

        if persist_if_truncated && truncation.truncated {
            self.ensure_temp_file();
        }

        Snapshot {
            content: truncation.content.clone(),
            truncation,
            full_output_path: self.temp_file_path.clone(),
        }
    }

    /// Bytes on the currently open (last, newline-free) line — the oracle's
    /// `getLastLineBytes()`, used by the partial-last-line note.
    #[must_use]
    pub fn last_line_bytes(&self) -> usize {
        self.current_line_bytes
    }

    /// The full output for programmatic callers. Beyond `max_bytes` the middle
    /// is dropped with an omission marker, first/last halves kept — the
    /// oracle's `readFullOutput`.
    #[must_use]
    pub fn read_full_output(&mut self, max_bytes: usize) -> (String, bool) {
        // No spill: the contiguous raw buffer is the full output. Moving the
        // buffer into `String::from_utf8` is a zero-copy reinterpretation on the
        // common valid-UTF-8 case; only invalid bytes pay for a lossy rebuild.
        let Some(path) = self.temp_file_path.clone() else {
            let raw = std::mem::take(&mut self.raw);
            return (from_utf8_owned(raw), false);
        };
        let Ok(bytes) = std::fs::read(&path) else {
            return (String::new(), false);
        };
        if bytes.len() <= max_bytes {
            return (from_utf8_owned(bytes), false);
        }
        let head_bytes = max_bytes / 2;
        let tail_bytes = max_bytes - head_bytes;
        // Head: streaming-decode and drop an incomplete trailing sequence,
        // matching `new TextDecoder().decode(head, { stream: true })`.
        let mut head_text = String::with_capacity(head_bytes);
        Utf8Stream::default().decode_into(&bytes[..head_bytes], &mut head_text);
        let tail_start = skip_continuation(&bytes, bytes.len() - tail_bytes);
        let tail_text = String::from_utf8_lossy(&bytes[tail_start..]).into_owned();
        let omitted = bytes.len() - head_bytes - tail_bytes;
        (
            format!("{head_text}\n\n[... {omitted} bytes omitted ...]\n\n{tail_text}"),
            true,
        )
    }

    /// The path of the spill file holding the full stream, if one exists. Does
    /// not create a spill (unlike `snapshot(true)`).
    #[must_use]
    pub fn temp_output_path(&self) -> Option<PathBuf> {
        self.temp_file_path.clone()
    }

    /// The complete output, uncapped — the spill file's contents when a spill
    /// exists, else the in-memory raw buffer. Used by the Tier-1 compression
    /// pre-pass (Option B), which must see the middle of a large stream before
    /// legacy tail truncation discards it. The spill file itself is never
    /// modified, and `raw` is borrowed (not consumed) so `read_full_output`
    /// still produces `structured_output` afterwards.
    #[must_use]
    pub fn full_text(&self) -> String {
        if let Some(path) = self.temp_file_path.as_ref() {
            return match std::fs::read(path) {
                Ok(bytes) => from_utf8_owned(bytes),
                Err(_) => String::new(),
            };
        }
        from_utf8_owned(self.raw.clone())
    }

    fn append_decoded_text(&mut self, text: &str) {
        if text.is_empty() {
            return;
        }
        let bytes = js_byte_length(text);
        self.total_decoded_bytes += bytes;
        self.tail.push_str(text);
        if js_byte_length(&self.tail) > self.max_rolling_bytes * 2 {
            self.trim_tail();
        }

        let newlines = text.matches('\n').count();
        if newlines == 0 {
            self.current_line_bytes += bytes;
            self.has_open_line = true;
        } else {
            self.completed_lines += newlines;
            let tail = match text.rfind('\n') {
                Some(idx) => &text[idx + 1..],
                None => text,
            };
            self.current_line_bytes = js_byte_length(tail);
            self.has_open_line = !tail.is_empty();
        }
        self.total_lines = self.completed_lines + usize::from(self.has_open_line);
    }

    fn trim_tail(&mut self) {
        let bytes = self.tail.as_bytes();
        if bytes.len() <= self.max_rolling_bytes {
            return;
        }
        let mut start = bytes.len() - self.max_rolling_bytes;
        while start < bytes.len() && (bytes[start] & 0xc0) == 0x80 {
            start += 1;
        }
        if start > 0 {
            self.tail_starts_at_line_boundary = bytes[start - 1] == 0x0a;
        }
        self.tail = String::from_utf8_lossy(&bytes[start..]).into_owned();
    }

    fn snapshot_text(&self) -> String {
        if self.tail_starts_at_line_boundary {
            return self.tail.clone();
        }
        match self.tail.find('\n') {
            Some(idx) => self.tail[idx + 1..].to_string(),
            None => self.tail.clone(),
        }
    }

    fn should_use_temp_file(&self) -> bool {
        self.total_raw_bytes > self.max_bytes
            || self.total_decoded_bytes > self.max_bytes
            || self.total_lines > self.max_lines
    }

    fn ensure_temp_file(&mut self) {
        if self.temp_file_path.is_some() {
            return;
        }
        let Some((path, file)) = create_output_file(&self.temp_file_prefix) else {
            return;
        };
        let mut writer = BufWriter::new(file);
        let _ = writer.write_all(&self.raw);
        self.raw.clear();
        self.raw.shrink_to_fit();
        self.temp_file_path = Some(path);
        self.temp_writer = Some(writer);
    }
}

/// Consume a byte buffer as UTF-8, replacing invalid sequences only when the
/// buffer is not valid UTF-8. String::from_utf8 reuses the allocation, so the
/// common all-valid case is a zero-copy reinterpretation.
fn from_utf8_owned(bytes: Vec<u8>) -> String {
    String::from_utf8(bytes)
        .unwrap_or_else(|err| String::from_utf8_lossy(err.as_bytes()).into_owned())
}

/// Move start forward past UTF-8 continuation bytes so a tail slice begins on a
/// character boundary (the oracle's truncateStringToBytesFromEnd skip).
fn skip_continuation(bytes: &[u8], mut start: usize) -> usize {
    while start < bytes.len() && (bytes[start] & 0xc0) == 0x80 {
        start += 1;
    }
    start
}

/// Create the spill file under the system temp dir, 0600, prefix-tagged.
fn create_output_file(prefix: &str) -> Option<(PathBuf, File)> {
    let dir = std::env::temp_dir();
    let unique = format!(
        "{}-{}-{}.log",
        prefix,
        std::process::id(),
        monotonic_nanos()
    );
    let path = dir.join(unique);
    let file = File::create(&path).ok()?;
    set_private_permissions(&path);
    Some((path, file))
}

#[cfg(unix)]
fn set_private_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &Path) {}

fn monotonic_nanos() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn small_output_never_spills() {
        let mut acc = OutputAccumulator::new("pi-output");
        acc.append(b"hello\nworld\n");
        acc.finish();
        let snap = acc.snapshot(true);
        assert!(!snap.truncation.truncated);
        assert!(snap.full_output_path.is_none());
        assert_eq!(snap.content, "hello\nworld\n");
        // The oracle's streaming counter reports 2 lines here (one completed by
        // the newline, one open) — NOT 3. Verified against OutputAccumulator.
        assert_eq!(snap.truncation.total_lines, 2);
    }

    #[test]
    fn large_output_spills_and_truncates() {
        let mut acc = OutputAccumulator::new("pi-output-test");
        let big = "x".repeat(60 * 1024);
        acc.append(big.as_bytes());
        acc.finish();
        let snap = acc.snapshot(true);
        assert!(snap.truncation.truncated);
        assert!(snap.full_output_path.is_some());
        let path = snap.full_output_path.clone().unwrap();
        assert_eq!(std::fs::read(&path).unwrap().len(), 60 * 1024);
        let (full, was_truncated) = acc.read_full_output(50 * 1024);
        assert!(was_truncated);
        assert!(full.contains("bytes omitted"));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn full_text_returns_small_output_without_spill() {
        let mut acc = OutputAccumulator::new("pi-output-test");
        acc.append(b"hello\nworld\n");
        acc.finish();
        assert_eq!(acc.full_text(), "hello\nworld\n");
    }

    #[test]
    fn full_text_returns_the_whole_spilled_stream_uncapped() {
        let mut acc = OutputAccumulator::new("pi-output-test");
        let body: String = (0..3000)
            .map(|i| format!("line{i}\n"))
            .collect();
        acc.append(body.as_bytes());
        acc.finish();
        let snapshot = acc.snapshot(true);
        let path = snapshot.full_output_path.clone().unwrap();
        // full_text sees the middle that the tail snapshot discarded.
        assert_eq!(acc.full_text(), body);
        assert!(acc.full_text().contains("line5\n"));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn full_output_is_returned_verbatim_under_the_limit() {
        let mut acc = OutputAccumulator::new("pi-output-test");
        acc.append(b"abc");
        acc.append(b"def");
        acc.finish();
        let (full, was_truncated) = acc.read_full_output(50 * 1024);
        assert!(!was_truncated);
        assert_eq!(full, "abcdef");
    }

    #[test]
    fn stdout_and_stderr_interleave_in_arrival_order() {
        let mut acc = OutputAccumulator::new("pi-output-test");
        acc.append(b"out\n");
        acc.append(b"err\n");
        acc.finish();
        let snap = acc.snapshot(false);
        assert_eq!(snap.content, "out\nerr\n");
    }

    #[test]
    fn empty_output_snapshot_is_empty_and_untruncated() {
        let mut acc = OutputAccumulator::new("pi-output-test");
        acc.finish();
        let snap = acc.snapshot(true);
        assert_eq!(snap.content, "");
        assert_eq!(snap.truncation.total_lines, 0);
        assert!(!snap.truncation.truncated);
        assert!(snap.full_output_path.is_none());
    }

    #[test]
    fn many_small_chunks_reassemble_identically() {
        let mut acc = OutputAccumulator::new("pi-output-test");
        let expected = "line one\nline two\nline three\n";
        for byte in expected.as_bytes() {
            acc.append(&[*byte]);
        }
        acc.finish();
        assert_eq!(acc.snapshot(false).content, expected);
    }

    #[test]
    fn invalid_utf8_is_replaced_not_dropped() {
        let mut acc = OutputAccumulator::new("pi-output-test");
        acc.append(&[0x61, 0xff, 0x62]);
        acc.finish();
        let content = acc.snapshot(false).content;
        assert!(content.starts_with('a') && content.ends_with('b'));
        assert!(content.contains(char::REPLACEMENT_CHARACTER));
    }

    #[test]
    fn truncation_reports_the_byte_cap_cause() {
        let mut acc = OutputAccumulator::new("pi-output-test");
        // 60 KB of digits: over the 50 KB byte cap with few lines.
        acc.append("1".repeat(60 * 1024).as_bytes());
        acc.finish();
        let snap = acc.snapshot(true);
        assert!(snap.truncation.truncated);
        assert_eq!(snap.truncation.truncated_by, Some("bytes"));
        assert!(snap.truncation.last_line_partial);
    }

    #[test]
    fn spill_file_is_not_written_for_small_output() {
        let mut acc = OutputAccumulator::new("pi-output-test");
        acc.append(b"small\n");
        acc.finish();
        let snap = acc.snapshot(true);
        assert!(snap.full_output_path.is_none());
    }

    #[test]
    fn last_line_bytes_track_the_open_line() {
        let mut acc = OutputAccumulator::new("pi-output");
        acc.append(b"abc\nde");
        assert_eq!(acc.last_line_bytes(), 2);
    }

    #[test]
    fn last_line_bytes_resets_after_a_trailing_newline() {
        let mut acc = OutputAccumulator::new("pi-output");
        acc.append(b"abc\n");
        assert_eq!(acc.last_line_bytes(), 0);
    }

    #[test]
    fn multibyte_character_split_across_chunks_decodes_once() {
        // A pipe hands over whatever bytes are ready, so a 3-byte character can
        // straddle two reads. The streaming decoder must not emit a replacement
        // character per half (the pre-decoder behavior).
        let mut acc = OutputAccumulator::new("pi-output-test");
        acc.append(&[0xE8]);
        acc.append(&[0xAA, 0x9E, b'\n']);
        acc.finish();
        let snap = acc.snapshot(false);
        assert_eq!(snap.content, "語\n");
        assert_eq!(snap.truncation.total_bytes, 4);
    }

    #[test]
    fn four_byte_character_split_two_ways_decodes_once() {
        let mut acc = OutputAccumulator::new("pi-output-test");
        acc.append(&[0xF0, 0x9F]);
        acc.append(&[0x8E, 0x89]);
        acc.finish();
        let snap = acc.snapshot(false);
        assert_eq!(snap.content, "🎉");
        assert_eq!(snap.truncation.total_bytes, 4);
    }

    #[test]
    fn incomplete_sequence_at_end_of_stream_is_one_replacement() {
        let mut acc = OutputAccumulator::new("pi-output-test");
        acc.append(&[0xE8, 0xAA]); // start of a 3-byte char, never completed
        acc.finish();
        assert_eq!(acc.snapshot(false).content, "\u{FFFD}");
    }

    #[test]
    fn read_full_output_without_spill_returns_the_raw_bytes() {
        let mut acc = OutputAccumulator::new("pi-output-test");
        acc.append(b"hello ");
        acc.append("wörld".as_bytes());
        acc.finish();
        let (full, truncated) = acc.read_full_output(1024);
        assert!(!truncated);
        assert_eq!(full, "hello wörld");
    }

    #[test]
    fn read_full_output_marks_first_and_last_halves_with_a_byte_count() {
        // The head/tail split only applies once the output spilled to a file
        // (the oracle returns the raw buffer untruncated when it did not).
        let mut acc = OutputAccumulator::new("pi-output-test");
        acc.append("a".repeat(60 * 1024).as_bytes());
        acc.finish();
        let (full, truncated) = acc.read_full_output(100);
        assert!(truncated);
        assert!(full.starts_with(&"a".repeat(50)));
        assert!(full.ends_with(&"a".repeat(50)));
        assert!(full.contains("[... 61340 bytes omitted ...]")); // 61440 - 100
    }

    #[test]
    fn read_full_output_head_drops_an_incomplete_trailing_character() {
        // The head cut lands mid-character; a streaming decode drops the partial
        // sequence instead of emitting a replacement character. The trailing
        // bulk forces the spill path (read_full_output's head/tail branch).
        let mut acc = OutputAccumulator::new("pi-output-test");
        let body = format!("aaa語語{}", "a".repeat(60 * 1024));
        acc.append(body.as_bytes());
        acc.finish();
        let (full, truncated) = acc.read_full_output(8); // head=4, tail=4
        assert!(truncated);
        assert!(full.starts_with("aaa\n\n"), "head must drop the partial char");
        assert!(!full.contains('\u{FFFD}'));
    }

    #[test]
    fn spill_file_is_created_with_private_permissions() {
        let mut acc = OutputAccumulator::new("pi-output-test");
        acc.append("x".repeat(60 * 1024).as_bytes());
        acc.finish();
        let snap = acc.snapshot(true);
        let path = snap.full_output_path.clone().expect("spilled");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600, "spill file must not be world-readable");
        }
        let _ = std::fs::remove_file(&path);
    }
}
