import * as path from "node:path";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import githubDark from "shiki/themes/github-dark.mjs";
import githubLight from "shiki/themes/github-light.mjs";

type LangLoader = () => Promise<{ default: unknown }>;

const LANG_LOADERS: Record<string, LangLoader> = {
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  vue: () => import("shiki/langs/vue.mjs"),
  svelte: () => import("shiki/langs/svelte.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  ruby: () => import("shiki/langs/ruby.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  kotlin: () => import("shiki/langs/kotlin.mjs"),
  swift: () => import("shiki/langs/swift.mjs"),
  c: () => import("shiki/langs/c.mjs"),
  cpp: () => import("shiki/langs/cpp.mjs"),
  csharp: () => import("shiki/langs/csharp.mjs"),
  php: () => import("shiki/langs/php.mjs"),
  shell: () => import("shiki/langs/shellscript.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  jsonc: () => import("shiki/langs/jsonc.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  toml: () => import("shiki/langs/toml.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  mdx: () => import("shiki/langs/mdx.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  scss: () => import("shiki/langs/scss.mjs"),
  sass: () => import("shiki/langs/sass.mjs"),
  less: () => import("shiki/langs/less.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  xml: () => import("shiki/langs/xml.mjs"),
  docker: () => import("shiki/langs/docker.mjs"),
  lua: () => import("shiki/langs/lua.mjs"),
  zig: () => import("shiki/langs/zig.mjs"),
};

export type LangId = keyof typeof LANG_LOADERS;

const EXT_TO_LANG: Record<string, LangId> = {
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

const DARK_THEME = "github-dark";
const LIGHT_THEME = "github-light";

let highlighterPromise: Promise<HighlighterCore> | null = null;
const loadedLangs = new Set<string>();

async function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [githubDark, githubLight],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
}

export function langForFile(filename: string): LangId | "text" {
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
  lang: LangId | "text",
  theme: ThemeKind,
): Promise<HighlightedLines> {
  if (text.length === 0) return { lines: [] };
  const hl = await getHighlighter();
  const themeName = theme === "dark" ? DARK_THEME : LIGHT_THEME;

  if (lang !== "text" && !loadedLangs.has(lang)) {
    const loader = LANG_LOADERS[lang];
    if (loader) {
      try {
        const mod = await loader();
        await hl.loadLanguage(mod.default as never);
        loadedLangs.add(lang);
      } catch {
        lang = "text";
      }
    } else {
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
