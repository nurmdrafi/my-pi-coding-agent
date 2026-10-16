# Terminal setup — Ghostty recommended

Pi runs in any modern terminal. This harness recommends **[Ghostty](https://ghostty.org)**
for interactive sessions because it handles the extended-key protocol Pi needs,
renders inline images, and has clean shell integration. Ghostty is a
**recommendation, not a dependency**: existing terminals (Terminal.app, iTerm2,
Kitty, WezTerm, VS Code, tmux, SSH) keep working and are fully supported.

This document is about the terminal emulator only. It has no effect on the
`piread` / `piedit` / `pidx` Rust tool daemons — those are independent
performance work documented in [`README.md`](../README.md#native-tool-performance).

## Quick start

```sh
sh ~/.pi/agent/scripts/setup-ghostty.sh          # configure (backs up, idempotent)
sh ~/.pi/agent/scripts/setup-ghostty.sh --check  # verify
sh ~/.pi/agent/scripts/pi-ghostty.sh             # start Pi via Ghostty
```

Expected: the first command reports the config file it wrote (or
`already configured — no change`); `--check` exits `0` when the keybind and the
Ghostty binary are both present, `1` otherwise; `pi-ghostty.sh` starts Pi in the
current terminal when one is attached.

## Install Ghostty

Install from the official sources for your platform — package names change, so
always confirm against the upstream page:
<https://ghostty.org/docs/install/binary>.

- **macOS** — official signed `.dmg` from <https://ghostty.org/download>, or the
  community Homebrew cask:

  ```sh
  brew install --cask ghostty
  ```

- **Linux** — use your distribution's package (Arch `extra`, Alpine testing,
  Gentoo, Solus, Void, Snap, and others carry Ghostty), a community build, or
  build from source. See the official page above; this harness intentionally
  does not hardcode per-distribution package commands.

The setup script never installs anything. If Ghostty is absent it prints the
install link and continues configuring the config file.

## What the setup script does

`scripts/setup-ghostty.sh` edits Ghostty's text configuration only. It:

1. Detects the OS and locates Ghostty (`command -v ghostty`, plus
   `/Applications/Ghostty.app` on macOS).
2. Picks the config file Ghostty actually loads (see below), preferring the file
   that already exists so it is never duplicated.
3. Ensures `keybind = alt+backspace=text:\x1b\x7f`, backing up the file first and
   preserving every unrelated setting.
4. Warns about the legacy `keybind = shift+enter=text:\n` mapping and about
   `shell-integration = none`, without changing either unless asked.

Re-running is idempotent: when the keybind is already correct the script writes
nothing and creates no backup.

| Option | Effect |
| --- | --- |
| `--check` | Report only; exit `1` if the keybind or Ghostty is missing. Never writes. |
| `--dry-run` | Show the planned change; write nothing. |
| `--remove-legacy` | Also remove the legacy `shift+enter=text:\n` mapping. |
| `--config PATH` | Edit `PATH` instead of the platform default. |
| `-h`, `--help` | Usage. |

Overrides: `GHOSTTY_CONFIG` (same as `--config`) and `GHOSTTY_BIN` (explicit
`ghostty` executable; when set, `PATH` is not consulted).

## Config file locations

Ghostty loads, in order (later files override earlier ones):

- `$XDG_CONFIG_HOME/ghostty/config.ghostty` then `.../config` (all platforms;
  `XDG_CONFIG_HOME` defaults to `~/.config`)
- `~/Library/Application Support/com.mitchellh.ghostty/config.ghostty` then
  `.../config` (macOS only, loaded after the XDG files)

`config.ghostty` is the current name; `config` is the pre-1.2.3 legacy name. The
script reuses an existing legacy file rather than creating `config.ghostty`
alongside it, and creates `config.ghostty` only when neither exists.

## Why the Alt+Backspace keybind

```text
keybind = alt+backspace=text:\x1b\x7f
```

Some terminals, Ghostty included, do not send `Alt+Backspace` in the form Pi
expects for delete-word. This mapping makes Ghostty emit the escape sequence Pi
handles. It is the only keybind the harness sets.

### The legacy Shift+Enter mapping

An older Claude Code setup may have written:

```text
keybind = shift+enter=text:\n
```

That sends a raw linefeed, which Pi cannot distinguish from `Ctrl+J`, and it
prevents real `Shift+Enter` events from reaching Pi (and tmux). Remove it unless
an old Claude Code install is the only reason it exists. The setup script warns
when it sees it; use `--remove-legacy` to delete it.

## Shell integration

Ghostty's default is `shell-integration = detect`, and the script leaves it
untouched. Pi uses the resulting OSC 133 prompt and working-directory reporting.
If a config explicitly sets `shell-integration = none`, the script warns but does
not change it.

## Launching Pi

Inside Ghostty, just run `pi`.

To start Pi from outside a terminal (desktop launcher, hotkey), use the
launcher:

```sh
sh scripts/pi-ghostty.sh [pi args...]
```

Behavior:

- **Already in a terminal** (Ghostty or any other) — runs `pi` right there; no
  new window is opened. This is deliberate, so the launcher never surprises you
  with a second window.
- **No terminal attached and Ghostty present** — opens a Ghostty window in the
  current working directory running `pi`, inheriting the current environment.
- **No terminal and no Ghostty** — prints install guidance and exits `1`.

The launcher does not set `TERM`, keyboard-protocol, image, or color variables;
Pi's terminal detection is left to run normally.

## Verifying

```sh
sh scripts/setup-ghostty.sh --check
ghostty --version
ghostty +show-config --default | rg shell-integration
```

Expected:

- `--check` prints `OK: Pi Alt+Backspace keybind present.` and
  `OK: Ghostty binary found.`, then exits `0`.
- `ghostty --version` prints the version (needs Ghostty on `PATH`).
- The `+show-config` line shows shell integration at `detect` unless you changed
  it.

Then, interactively in Ghostty, confirm: `Shift+Enter` inserts a newline while
`Enter` submits; `Alt+Backspace` deletes a word; scrolling and mouse-wheel
behavior are normal; links are clickable.

## Troubleshooting

- **`Alt+Backspace` does nothing** — run the setup script; confirm the keybind
  line is in the file `~/Library/Application Support/com.mitchellh.ghostty/config.ghostty`
  (macOS) or `~/.config/ghostty/config.ghostty` (Linux). Reload Ghostty config
  with `Cmd+Shift+,` (macOS) or `Ctrl+Shift+,` (Linux).
- **`Shift+Enter` submits instead of inserting a line** — remove the legacy
  `shift+enter=text:\n` mapping (`--remove-legacy`). Pi already binds `Ctrl+J` as
  a newline alternative.
- **Links show no hover preview while Pi holds the mouse** — hold `Shift+Cmd`
  (macOS) or `Shift+Ctrl` (Linux) to use Ghostty's native link handling.
- **Colors, images, or inline graphics look wrong** — Pi reads the
  capabilities the terminal reports; no environment variable needs to be set. If
  detection is genuinely wrong, fix the terminal rather than forcing `TERM`, and
  report it.
- **A new window opens when I wanted Pi here** — you launched
  `pi-ghostty.sh` from outside a terminal; run `pi` directly instead.

## Fallback

Without Ghostty, everything else still works:

- Run `pi` in your current terminal.
- The config script only edits Ghostty's config; other terminals are untouched
  and do not need it.
- `--check` fails only because Ghostty is absent; the harness itself is
  unaffected.
