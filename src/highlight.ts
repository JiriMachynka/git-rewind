import * as path from "node:path";
import type { Highlighter, BundledLanguage, BundledTheme } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLangs = new Set<BundledLanguage>();

const EXT_TO_LANG: Record<string, BundledLanguage> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  vue: "vue",
  svelte: "svelte",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  json: "json",
  jsonc: "jsonc",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  md: "markdown",
  mdx: "mdx",
  html: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  sql: "sql",
  xml: "xml",
  dockerfile: "docker",
  lua: "lua",
  zig: "zig",
};

export type ThemeKind = "dark" | "light";

const DARK_THEME: BundledTheme = "github-dark";
const LIGHT_THEME: BundledTheme = "github-light";

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    const { createHighlighter } = await import("shiki");
    highlighterPromise = createHighlighter({
      themes: [DARK_THEME, LIGHT_THEME],
      langs: ["typescript", "javascript", "json", "vue"],
    });
    for (const l of ["typescript", "javascript", "json", "vue"] as const) {
      loadedLangs.add(l);
    }
  }
  return highlighterPromise;
}

export function langForFile(filename: string): BundledLanguage | "text" {
  const base = path.basename(filename).toLowerCase();
  if (base === "dockerfile") return "docker";
  const ext = path.extname(filename).slice(1).toLowerCase();
  return EXT_TO_LANG[ext] ?? "text";
}

export interface HighlightedLines {
  // Per-line inner HTML (token spans). Use index 0-based; line N in file = index N-1.
  lines: string[];
}

export async function highlightLines(
  text: string,
  lang: BundledLanguage | "text",
  theme: ThemeKind,
): Promise<HighlightedLines> {
  if (text.length === 0) return { lines: [] };
  const hl = await getHighlighter();
  const themeName = theme === "dark" ? DARK_THEME : LIGHT_THEME;

  if (lang !== "text" && !loadedLangs.has(lang)) {
    try {
      await hl.loadLanguage(lang);
      loadedLangs.add(lang);
    } catch {
      lang = "text";
    }
  }

  if (lang === "text") {
    return {
      lines: text.split("\n").map((l) => escapeHtml(l)),
    };
  }

  const html = hl.codeToHtml(text, {
    lang,
    theme: themeName,
    transformers: [
      {
        // Strip the wrapping <pre>/<code>; we'll provide our own DOM structure.
        pre(node) {
          node.tagName = "div";
          node.properties.class = "shiki-pre";
        },
        code(node) {
          node.tagName = "div";
          node.properties.class = "shiki-code";
        },
      },
    ],
  });

  // Extract per-line content. shiki emits `<span class="line">...</span>` per line.
  const lines: string[] = [];
  const re = /<span class="line">([\s\S]*?)<\/span>(?=\n|<\/div>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    lines.push(m[1]);
  }
  // Fallback if extraction missed.
  if (lines.length === 0) {
    return { lines: text.split("\n").map((l) => escapeHtml(l)) };
  }
  return { lines };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return ch;
    }
  });
}
