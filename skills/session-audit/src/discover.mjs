import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const DEFAULT_SESSIONS_DIR = join(homedir(), '.pi', 'agent', 'sessions');
const ACTIVE_SESSION_MS = 5 * 60 * 1000; // invariant 5: exclude the live session

/**
 * Find session transcripts under the pi sessions dir, newest first.
 * Layout: <sessionsDir>/<sanitized-cwd>/<ISO-ts>_<session-uuid>.jsonl.
 * The real project path (cwd) is read from each file's `session` header line;
 * the mangled directory name is only a fallback.
 */
export function discoverSessions({
  sessionsDir = DEFAULT_SESSIONS_DIR,
  maxSessions = Infinity,
  excludeActiveMs = ACTIVE_SESSION_MS,
} = {}) {
  const sessions = [];
  const excludedActive = [];
  if (!existsSync(sessionsDir)) return { sessions, excludedActive };
  const now = Date.now();
  for (const project of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    const projectDir = join(sessionsDir, project.name);
    let names;
    try { names = readdirSync(projectDir); } catch { continue; }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue;
      const path = join(projectDir, name);
      let mtime;
      try { mtime = statSync(path).mtimeMs; } catch { continue; }
      // filename: 2026-09-05T05-36-33-059Z_<uuid>.jsonl → session id is the uuid
      const sessionId = name.replace(/\.jsonl$/, '').split('_').slice(1).join('_') || name;
      if (now - mtime < excludeActiveMs) {
        excludedActive.push(sessionId);
        continue;
      }
      sessions.push({
        path,
        mtime,
        project: sessionCwd(path) ?? project.name,
        mangledProject: project.name,
        sessionId,
      });
    }
  }
  sessions.sort((a, b) => b.mtime - a.mtime);
  return { sessions: sessions.slice(0, maxSessions), excludedActive };
}

/** Read the `session` header line of a transcript; null if unreadable. */
function sessionCwd(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n').slice(0, 5)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const e = JSON.parse(trimmed);
      if (e?.type === 'session' && typeof e.cwd === 'string') return e.cwd;
      if (e?.type !== 'session') break; // header is the first line when present
    }
  } catch { /* tolerate */ }
  return null;
}

/** Locate one session file by id (uuid, or any unique filename fragment). */
export function findSession(sessionId, sessionsDir = DEFAULT_SESSIONS_DIR) {
  if (!existsSync(sessionsDir)) return null;
  for (const project of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    const projectDir = join(sessionsDir, project.name);
    let names;
    try { names = readdirSync(projectDir); } catch { continue; }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue;
      if (name.includes(sessionId)) {
        return {
          path: join(projectDir, name),
          project: sessionCwd(join(projectDir, name)) ?? project.name,
          sessionId: name.replace(/\.jsonl$/, '').split('_').slice(1).join('_') || name,
        };
      }
    }
  }
  return null;
}
