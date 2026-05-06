# Git Rewind

[![Version](https://img.shields.io/visual-studio-marketplace/v/jiri.git-rewind?label=marketplace)](https://marketplace.visualstudio.com/items?itemName=jiri.git-rewind)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/jiri.git-rewind)](https://marketplace.visualstudio.com/items?itemName=jiri.git-rewind)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/jiri.git-rewind)](https://marketplace.visualstudio.com/items?itemName=jiri.git-rewind&ssr=false#review-details)
[![License](https://img.shields.io/github/license/JiriMachynka/git-rewind)](LICENSE)

Browse a file's git history with rename-aware diffs, conventional-commit cues, pickaxe search, and side-by-side compare. No LOC limits, no external services, no telemetry.

![Git Rewind panel](media/screenshot.png)

## Features

- **Horizontal commit timeline** — newest right, oldest left. Click or use `←`/`→` (or `j`/`k`) to step through history.
- **Rename-aware** — follows files across `git mv` and content-detected renames (`-M`). Pre-rename diffs render correctly. Renamed commits show a purple `R` badge.
- **Word-level diff** — intra-line additions and deletions highlighted, not just whole-line changes.
- **Compare any two commits** — Alt-click (or Cmd-click on macOS) any commit to set it as the base, then pick another to diff against it.
- **Pickaxe search** — find commits that added or removed a code string (`git log -S`). Narrows the timeline to matching commits.
- **Filter by author/message/SHA** — type in the search box; press `/` to focus.
- **Conventional Commits cues** — colored stripes per type (`feat`, `fix`, `docs`, …), badges in the callout, breaking-change `!` markers.
- **Syntax-highlighted diffs** — Shiki, theme-aware (light, dark, high-contrast).
- **Per-file memory** — last viewed commit is restored when you reopen the panel.
- **Initial-commit handling** — when a file was introduced in a commit, the full file is shown as context.
- **Jump to next/prev change** — `n` / `p` while focused on the diff.

## Usage

Open any file in a Git repository, then:

- **Editor title bar** → click the `⏱` icon
- **Right-click in editor** → "View File History"
- **Right-click in Explorer** → "View File History"
- **Keyboard** → `Alt+Cmd+H` (macOS) / `Alt+Ctrl+H` (Windows/Linux)
- **Command palette** → "Git Rewind: View File History"

### Keyboard shortcuts (inside the panel)

| Key | Action |
|-----|--------|
| `←` / `j` | Older commit |
| `→` / `k` | Newer commit |
| `n` | Jump to next change in diff |
| `p` | Jump to previous change in diff |
| `/` | Focus the filter input |
| `Esc` (in filter) | Clear filter |
| `Alt+R` | Refresh current commit view |

### Commands

- `Git Rewind: View File History`
- `Git Rewind: Refresh File History`
- `Git Rewind: Next Commit`
- `Git Rewind: Previous Commit`

## Requirements

- VS Code `1.85.0` or newer
- Git installed and on `PATH`
- File must be inside a Git working tree

## Limitations

- Inline diff only (no side-by-side mode yet)
- No "open on remote" link (GitHub / GitLab) yet
- No ignore-whitespace toggle yet
- Commit subject only — body is not displayed yet
- File path under git is converted using `path.relative` — Windows path separators may need testing in deeply nested repos

## Development

```bash
bun install
bun run typecheck
bun run build
# or
bun run watch
```

Press `F5` in VS Code to launch an extension-host window with the dev build.

## Privacy

Everything runs locally against your `git` binary. No network calls. No telemetry.

## License

[MIT](LICENSE)
