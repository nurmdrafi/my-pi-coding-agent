use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use crate::accumulator::OutputAccumulator;
use crate::cli::Request;

/// Outcome of one shell run.
pub struct RunOutcome {
    pub exit_code: Option<i32>,
    pub wall_time_seconds: f64,
    pub timed_out: bool,
    pub spawn_error: Option<String>,
}

/// Resolve the shell binary the way the built-in does: `$SHELL` when it is a
/// known POSIX-ish shell, else `bash`, else `sh` from PATH.
#[must_use]
pub fn resolve_shell() -> String {
    if let Ok(shell) = std::env::var("PI_BASH_SHELL")
        && !shell.is_empty()
    {
        return shell;
    }
    if let Ok(shell) = std::env::var("SHELL") {
        let name = Path::new(&shell)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        if matches!(name.as_str(), "bash" | "sh" | "zsh" | "dash") {
            return shell;
        }
    }
    "bash".to_string()
}

/// Run `req.command` under the shell, feeding every chunk to `accumulator`.
pub fn run(req: &Request, accumulator: &mut OutputAccumulator) -> RunOutcome {
    let started = Instant::now();
    if !req.cwd.is_dir() {
        return RunOutcome {
            exit_code: None,
            wall_time_seconds: 0.0,
            timed_out: false,
            spawn_error: Some(format!(
                "Working directory does not exist: {}",
                req.cwd.display()
            )),
        };
    }

    let shell = resolve_shell();
    let mut command = Command::new(&shell);
    command
        .arg("-c")
        .arg(&req.command)
        .current_dir(&req.cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // Put the shell in its own process group so a timeout can kill the whole
    // tree (shell + descendants) rather than just the direct child.
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(err) => {
            return RunOutcome {
                exit_code: None,
                wall_time_seconds: elapsed_seconds(started),
                timed_out: false,
                spawn_error: Some(format!("failed to spawn {shell}: {err}")),
            };
        }
    };

    let pid = child.id();
    // Drain both pipes on their own threads so a full pipe never deadlocks the
    // wait below; chunks are forwarded in arrival order.
    let (tx, rx) = mpsc::channel::<(Stream, Vec<u8>)>();
    let mut readers = Vec::new();
    if let Some(stdout) = child.stdout.take() {
        readers.push(spawn_reader(stdout, Stream::Stdout, tx.clone()));
    }
    if let Some(stderr) = child.stderr.take() {
        readers.push(spawn_reader(stderr, Stream::Stderr, tx.clone()));
    }
    drop(tx);

    let mut pending_out: Vec<Vec<u8>> = Vec::new();
    let mut pending_err: Vec<Vec<u8>> = Vec::new();

    // Reap on a dedicated thread so we can block without a poll interval: the
    // previous 2 ms `try_wait` loop added up to 2 ms of dead time to commands
    // that finish in ~1 ms (the common case), which dominated the latency.
    let (done_tx, done_rx) = mpsc::channel::<std::process::ExitStatus>();
    std::thread::spawn(move || {
        if let Ok(status) = child.wait() {
            let _ = done_tx.send(status);
        }
    });

    let deadline = req
        .timeout_seconds
        .map(|secs| Instant::now() + Duration::from_secs_f64(secs));
    let mut timed_out = false;
    let mut status: Option<std::process::ExitStatus> = None;

    loop {
        while let Ok((stream, chunk)) = rx.try_recv() {
            match stream {
                Stream::Stdout => pending_out.push(chunk),
                Stream::Stderr => pending_err.push(chunk),
            }
        }
        flush_pending(&mut pending_out, &mut pending_err, accumulator);

        match done_rx.recv_timeout(Duration::from_millis(1)) {
            Ok(exit_status) => {
                status = Some(exit_status);
                break;
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }

        if let Some(deadline) = deadline
            && Instant::now() >= deadline
        {
            timed_out = true;
            kill_tree(pid);
            match done_rx.recv_timeout(Duration::from_secs(2)) {
                Ok(exit_status) => status = Some(exit_status),
                Err(_) => kill_tree_hard(pid),
            }
            break;
        }
    }

    for reader in readers {
        let _ = reader.join();
    }
    while let Ok((stream, chunk)) = rx.try_recv() {
        match stream {
            Stream::Stdout => pending_out.push(chunk),
            Stream::Stderr => pending_err.push(chunk),
        }
    }
    flush_pending(&mut pending_out, &mut pending_err, accumulator);

    let exit_code = status.map(|s| exit_code_of(&s));
    RunOutcome {
        exit_code,
        wall_time_seconds: elapsed_seconds(started),
        timed_out,
        spawn_error: None,
    }
}

/// Which pipe a chunk came from.
#[derive(Debug, Clone, Copy)]
enum Stream {
    Stdout,
    Stderr,
}

/// Emit everything that has arrived. Within one drained batch stdout is kept
/// ahead of stderr so a command that prints then fails reads in that order;
/// both streams keep their own relative ordering.
fn flush_pending(
    out: &mut Vec<Vec<u8>>,
    err: &mut Vec<Vec<u8>>,
    accumulator: &mut OutputAccumulator,
) {
    for chunk in out.drain(..) {
        accumulator.append(&chunk);
    }
    for chunk in err.drain(..) {
        accumulator.append(&chunk);
    }
}

fn spawn_reader<R: Read + Send + 'static>(
    mut source: R,
    stream: Stream,
    tx: mpsc::Sender<(Stream, Vec<u8>)>,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        loop {
            match source.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    if tx.send((stream, buffer[..read].to_vec())).is_err() {
                        break;
                    }
                }
            }
        }
    })
}

/// `exit(status)`, or `128 + signal` — the convention the built-in bash tool
/// applies to signal-killed shells.
#[cfg(unix)]
fn exit_code_of(status: &std::process::ExitStatus) -> i32 {
    use std::os::unix::process::ExitStatusExt;
    if let Some(code) = status.code() {
        return code;
    }
    status.signal().map_or(1, |signal| 128 + signal)
}

#[cfg(not(unix))]
fn exit_code_of(status: &std::process::ExitStatus) -> i32 {
    status.code().unwrap_or(1)
}

#[cfg(unix)]
fn kill_tree(pid: u32) {
    signal_group(pid, "TERM");
}

#[cfg(unix)]
fn kill_tree_hard(pid: u32) {
    signal_group(pid, "KILL");
}

#[cfg(unix)]
fn signal_group(pid: u32, signal: &str) {
    // The child was spawned with process_group(0), so its pgid == its pid and a
    // negative pid targets the whole tree. Fall back to the direct pid.
    let group = format!("-{pid}");
    let sent = Command::new("kill")
        .args([format!("-{signal}"), group])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    if !sent {
        let _ = Command::new("kill")
            .args([format!("-{signal}"), pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

#[cfg(not(unix))]
fn kill_tree(_pid: u32) {}

#[cfg(not(unix))]
fn kill_tree_hard(_pid: u32) {}

fn elapsed_seconds(started: Instant) -> f64 {
    // The oracle rounds to 0.1s: `Math.round(ms / 100) / 10`.
    let millis = started.elapsed().as_millis() as f64;
    (millis / 100.0).round() / 10.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(command: &str) -> Request {
        Request {
            command: command.to_string(),
            cwd: std::env::temp_dir(),
            timeout_seconds: None,
        }
    }

    #[test]
    fn captures_stdout_and_a_zero_exit() {
        let mut acc = OutputAccumulator::new("pi-output-test");
        let outcome = run(&request("printf 'hi\\n'"), &mut acc);
        acc.finish();
        let snapshot = acc.snapshot(false);
        assert_eq!(outcome.exit_code, Some(0));
        assert_eq!(snapshot.content, "hi\n");
    }

    #[test]
    fn captures_stderr_and_a_non_zero_exit() {
        let mut acc = OutputAccumulator::new("pi-output-test");
        let outcome = run(&request("echo boom >&2; exit 3"), &mut acc);
        acc.finish();
        let snapshot = acc.snapshot(false);
        assert_eq!(outcome.exit_code, Some(3));
        assert!(snapshot.content.contains("boom"));
    }

    #[test]
    fn missing_working_directory_is_a_spawn_error() {
        let mut acc = OutputAccumulator::new("pi-output-test");
        let req = Request {
            command: "echo hi".to_string(),
            cwd: std::path::PathBuf::from("/definitely/not/here"),
            timeout_seconds: None,
        };
        let outcome = run(&req, &mut acc);
        assert!(outcome.spawn_error.is_some());
        assert_eq!(outcome.exit_code, None);
    }

    #[test]
    fn timeout_terminates_the_child_and_returns_promptly() {
        let mut acc = OutputAccumulator::new("pi-output-test");
        let req = Request {
            command: "sleep 30".to_string(),
            cwd: std::env::temp_dir(),
            timeout_seconds: Some(0.4),
        };
        let started = Instant::now();
        let outcome = run(&req, &mut acc);
        assert!(outcome.timed_out);
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "timeout path must not block on the child"
        );
    }

    #[test]
    fn timeout_kills_descendants_too() {
        let mut acc = OutputAccumulator::new("pi-output-test");
        let req = Request {
            command: "sleep 45 & sleep 45".to_string(),
            cwd: std::env::temp_dir(),
            timeout_seconds: Some(0.4),
        };
        let started = Instant::now();
        let outcome = run(&req, &mut acc);
        assert!(outcome.timed_out);
        assert!(started.elapsed() < Duration::from_secs(10));
    }
}

