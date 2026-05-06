# Changelog

All notable changes to **Git Rewind** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.1] — 2026-05-06

### Changed
- New extension icon.

## [0.1.0] — 2026-05-06

Initial public release.

### Added
- File-scoped commit history panel with horizontal timeline (oldest left, newest right).
- Word-level diff view with Shiki syntax highlighting, theme-aware.
- Rename-aware history via `git log --follow --name-status -M`. Pre-rename commits diff correctly against their historical paths. Renamed commits show a purple `R` badge and a `renamed: old → new` line in the callout.
- Compare-against-base mode: Alt/Cmd-click a commit to pin it as the diff base.
- Pickaxe search (`git log -S`) for commits that added/removed a code string.
- Filter input over message, author, email, and SHA.
- Conventional-commit parsing: type stripe color, badge, and breaking-change marker.
- Per-file last-viewed commit persistence via workspace `Memento`.
- Keyboard navigation: `j`/`k`/`←`/`→` for commits, `n`/`p` for diff changes, `/` for filter focus.
- Initial-commit detection — full file shown as context when no parent exists.
- Editor title bar action, editor and explorer context menu entries, and `Alt+Cmd+H` keybinding.
