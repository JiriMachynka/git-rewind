import * as vscode from "vscode";
import * as path from "node:path";
import { Commit, fileLog, pickaxeShas, repoRoot, showFileAt } from "./git";
import { computeLineDiff, WordOp } from "./diff";
import { escapeHtml, highlightLines, langForFile } from "./highlight";

interface PanelState {
  repo: string;
  relPath: string;
  filename: string;
  filePath: string;
  commits: Commit[];
  store?: vscode.Memento;
}

export interface RenderedLine {
  type: "add" | "del" | "ctx";
  num: number | null;
  html: string;
}

const PANELS = new Map<string, HistoryPanel>();
const LAST_SHA_KEY = "gitRewind.lastSha:";

const CC_TYPE_RE =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?(!)?:/i;

function parseConvCommit(
  subject: string,
): { type: string; scope?: string; breaking: boolean } | null {
  const m = CC_TYPE_RE.exec(subject);
  if (!m) return null;
  return {
    type: m[1].toLowerCase(),
    scope: m[2] ? m[2].slice(1, -1) : undefined,
    breaking: !!m[3],
  };
}

export class HistoryPanel {
  static active: HistoryPanel | undefined;

  static async openFor(
    extensionUri: vscode.Uri,
    filePath: string,
    store?: vscode.Memento,
  ): Promise<void> {
    const existing = PANELS.get(filePath);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.Active);
      return;
    }
    const repo = await repoRoot(filePath);
    if (!repo) {
      void vscode.window.showInformationMessage(
        "File is not in a git repository.",
      );
      return;
    }
    const rel = path.relative(repo, filePath);
    const commits = await fileLog(repo, rel);
    if (commits.length === 0) {
      void vscode.window.showInformationMessage(
        `No git history for ${path.basename(filePath)}.`,
      );
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "gitRewind.panel",
      `History: ${path.basename(filePath)}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
      },
    );
    panel.iconPath = new vscode.ThemeIcon("history");
    const inst = new HistoryPanel(panel, extensionUri, {
      repo,
      relPath: rel,
      filename: path.basename(filePath),
      filePath,
      commits,
      store,
    });
    PANELS.set(filePath, inst);
    HistoryPanel.active = inst;
    panel.onDidDispose(() => {
      PANELS.delete(filePath);
      if (HistoryPanel.active === inst) HistoryPanel.active = undefined;
    });
    panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) HistoryPanel.active = inst;
    });
  }

  step(delta: number): void {
    this.panel.webview.postMessage({ type: "step", delta });
  }

  refresh(): void {
    if (this.lastSha) void this.postCommitView(this.lastSha);
  }

  private lastSha: string | undefined;

  private constructor(
    readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly state: PanelState,
  ) {
    panel.webview.html = this.html(panel.webview);
    panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === "ready") {
        this.postInit();
      } else if (msg?.type === "selectCommit") {
        const base = typeof msg.base === "string" ? msg.base : undefined;
        await this.postCommitView(String(msg.sha), base);
      } else if (msg?.type === "pickaxe") {
        await this.handlePickaxe();
      }
    });
    vscode.window.onDidChangeActiveColorTheme(() => {
      const last = this.lastSha;
      if (last) void this.postCommitView(last);
    });
  }

  private postInit(): void {
    try {
      const breadcrumb = this.state.relPath.split(/[\\/]/).filter(Boolean);
      this.panel.webview.postMessage({
        type: "init",
        filename: this.state.filename,
        relPath: this.state.relPath,
        breadcrumb,
        commits: this.state.commits.map((c) => {
          const cc = parseConvCommit(c.subject);
          return {
            sha: c.sha,
            shortSha: c.shortSha,
            author: c.author,
            email: c.email,
            date: c.date.toISOString(),
            relativeDate: c.relativeDate,
            subject: c.subject,
            path: c.path,
            oldPath: c.oldPath ?? null,
            ccType: cc?.type ?? null,
            ccScope: cc?.scope ?? null,
            ccBreaking: cc?.breaking ?? false,
          };
        }),
      });
      const initialSha =
        this.getRememberedSha() ?? this.state.commits[0]?.sha;
      if (initialSha) void this.postCommitView(initialSha);
    } catch (e) {
      console.error("[git-rewind] postInit failed:", e);
      this.panel.webview.postMessage({
        type: "fatal",
        message:
          "Failed to load history: " +
          (e instanceof Error ? e.message + "\n" + (e.stack ?? "") : String(e)),
      });
    }
  }

  private getRememberedSha(): string | undefined {
    if (!this.state.store) return undefined;
    const stored = this.state.store.get<string>(
      LAST_SHA_KEY + this.state.filePath,
    );
    if (!stored) return undefined;
    return this.state.commits.some((c) => c.sha === stored) ? stored : undefined;
  }

  private rememberSha(sha: string): void {
    if (!this.state.store) return;
    void this.state.store.update(LAST_SHA_KEY + this.state.filePath, sha);
  }

  private async handlePickaxe(): Promise<void> {
    const term = await vscode.window.showInputBox({
      prompt: `Find commits that added or removed a string in ${this.state.relPath}`,
      placeHolder: "string to search for (case-sensitive)",
      ignoreFocusOut: false,
    });
    if (!term) {
      this.panel.webview.postMessage({
        type: "pickaxeResult",
        term: "",
        shas: null,
      });
      return;
    }
    const shas = await pickaxeShas(this.state.repo, this.state.relPath, term);
    this.panel.webview.postMessage({ type: "pickaxeResult", term, shas });
  }

  private async postCommitView(sha: string, baseSha?: string): Promise<void> {
    this.lastSha = sha;
    if (!baseSha) this.rememberSha(sha);
    const { repo, relPath, filename } = this.state;
    const themeKind =
      vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ||
      vscode.window.activeColorTheme.kind ===
        vscode.ColorThemeKind.HighContrastLight
        ? "light"
        : "dark";
    const lang = langForFile(filename);

    const compareMode = !!baseSha;
    const oldRef = compareMode ? baseSha! : `${sha}~1`;
    const commit = this.state.commits.find((c) => c.sha === sha);
    const baseCommit = compareMode
      ? this.state.commits.find((c) => c.sha === baseSha)
      : undefined;
    const newPath = commit?.path ?? relPath;
    const oldPath = compareMode
      ? baseCommit?.path ?? relPath
      : commit?.oldPath ?? commit?.path ?? relPath;
    let parentExists = true;
    const [newText, oldText] = await Promise.all([
      showFileAt(repo, sha, newPath),
      showFileAt(repo, oldRef, oldPath).catch(() => {
        if (!compareMode) parentExists = false;
        return "";
      }),
    ]);
    const isInitial = !compareMode && !parentExists;

    const diff = computeLineDiff(oldText, newText);

    const [newH, oldH] = await Promise.all([
      highlightLines(newText, lang, themeKind),
      isInitial
        ? Promise.resolve({ lines: [] as string[] })
        : highlightLines(oldText, lang, themeKind),
    ]);

    const rendered: RenderedLine[] = isInitial
      ? newH.lines.map((html, idx) => ({
          type: "ctx" as const,
          num: idx + 1,
          html,
        }))
      : diff.map((l) => {
          if (l.wordOps) {
            return {
              type: l.type,
              num: l.type === "del" ? l.oldNum : l.newNum,
              html: renderWordOps(l.wordOps),
            };
          }
          if (l.type === "add" || l.type === "ctx") {
            const html =
              newH.lines[(l.newNum ?? 1) - 1] ?? escapeHtml(l.content);
            return { type: l.type, num: l.newNum, html };
          }
          const html = oldH.lines[(l.oldNum ?? 1) - 1] ?? escapeHtml(l.content);
          return { type: "del", num: l.oldNum, html };
        });

    const stats = isInitial
      ? { add: rendered.length, del: 0 }
      : rendered.reduce(
          (a, l) => {
            if (l.type === "add") a.add++;
            else if (l.type === "del") a.del++;
            return a;
          },
          { add: 0, del: 0 },
        );

    this.panel.webview.postMessage({
      type: "commit",
      sha,
      baseSha: compareMode ? baseSha : null,
      lines: rendered,
      stats,
      theme: themeKind,
      isInitial,
    });
  }

  private html(webview: vscode.Webview): string {
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "panel.css"),
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "panel.js"),
    );
    const nonce = makeNonce();
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} https: data:`,
      `font-src ${webview.cspSource}`,
    ].join("; ");
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<link rel="stylesheet" href="${cssUri}" />
<title>File History</title>
</head>
<body>
<header id="header">
  <nav id="breadcrumb" aria-label="File path"></nav>
  <div id="toolbar">
    <input id="search" type="search" placeholder="Filter commits — message, author, sha…" autocomplete="off" spellcheck="false" />
    <button id="pickaxe-btn" type="button" title="Find commits that added or removed a code string">⛏ Find in code…</button>
    <div id="pickaxe-pill" class="pill" hidden>
      <span class="pill-label">code:</span>
      <span id="pickaxe-term"></span>
      <button id="pickaxe-clear" type="button" title="Clear pickaxe filter">×</button>
    </div>
    <div id="compare-pill" class="pill" hidden>
      <span class="pill-label">vs base</span>
      <span id="compare-base-sha"></span>
      <button id="compare-clear" type="button" title="Clear compare base">×</button>
    </div>
    <div id="search-count"></div>
  </div>
  <div id="strip-wrap">
    <div id="strip"></div>
  </div>
  <div id="callout-wrap"><div id="callout"></div></div>
</header>
<div id="banner" class="banner" hidden></div>
<main id="diff"></main>
<script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}

function renderWordOps(ops: WordOp[]): string {
  let s = "";
  for (const o of ops) {
    const cls = o.type === "add" ? "w-add" : o.type === "del" ? "w-del" : "";
    if (cls) s += `<span class="${cls}">${escapeHtml(o.text)}</span>`;
    else s += escapeHtml(o.text);
  }
  return s;
}

function makeNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 32; i++)
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}
