import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";

const pExecFile = promisify(execFile);

export interface Commit {
  sha: string;
  shortSha: string;
  author: string;
  email: string;
  date: Date;
  relativeDate: string;
  subject: string;
  path: string;
  oldPath?: string;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await pExecFile("git", args, {
    cwd,
    maxBuffer: 50 * 1024 * 1024,
  });
  return stdout;
}

export async function repoRoot(filePath: string): Promise<string | null> {
  try {
    const out = await git(path.dirname(filePath), [
      "rev-parse",
      "--show-toplevel",
    ]);
    return out.trim();
  } catch {
    return null;
  }
}

const SEP = "\x1f";
const RECORD = "\x1e";

export async function fileLog(
  repo: string,
  relPath: string,
): Promise<Commit[]> {
  const fmt =
    RECORD + ["%H", "%h", "%an", "%ae", "%aI", "%ar", "%s"].join(SEP);
  const out = await git(repo, [
    "log",
    "--follow",
    "--name-status",
    "-M",
    `--pretty=format:${fmt}`,
    "--",
    relPath,
  ]);
  const commits: Commit[] = [];
  for (const chunk of out.split(RECORD)) {
    const trimmed = chunk.replace(/^\n+/, "");
    if (!trimmed) continue;
    const lines = trimmed.split("\n");
    const [sha, shortSha, author, email, iso, rel, subject] =
      lines[0].split(SEP);
    if (!sha || sha.length < 7) continue;
    let path = relPath;
    let oldPath: string | undefined;
    for (let i = 1; i < lines.length; i++) {
      const ln = lines[i];
      if (!ln) continue;
      const parts = ln.split("\t");
      const status = parts[0] ?? "";
      if (status.startsWith("R") || status.startsWith("C")) {
        oldPath = parts[1];
        path = parts[2] ?? path;
      } else if (parts[1]) {
        path = parts[1];
      }
      break;
    }
    const date = new Date(iso);
    commits.push({
      sha,
      shortSha,
      author,
      email,
      date: isNaN(date.getTime()) ? new Date(0) : date,
      relativeDate: rel,
      subject: subject ?? "",
      path,
      oldPath,
    });
  }
  return commits;
}

export async function pickaxeShas(
  repo: string,
  relPath: string,
  term: string,
): Promise<string[]> {
  if (!term) return [];
  try {
    const out = await git(repo, [
      "log",
      "--follow",
      "--pretty=format:%H",
      `-S${term}`,
      "--",
      relPath,
    ]);
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function showFileAt(
  repo: string,
  sha: string,
  relPath: string,
): Promise<string> {
  try {
    return await git(repo, ["show", `${sha}:${relPath}`]);
  } catch {
    return "";
  }
}
