<p align="center">
  <img src="build/icon.png" width="80" />
</p>

<h1 align="center">Folio</h1>

<p align="center">
  The desktop reader for AI-generated markdown.<br>
  Built for Claude Code, Cursor, Windsurf, and Copilot output.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;<a href="#features">Features</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;<a href="#keyboard-shortcuts">Shortcuts</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;<a href="#build-from-source">Build</a>
</p>

<br>

<p align="center">
  <img src="screenshots/hero.png" width="720" alt="Folio — AI coding output reader" />
</p>

## Why Folio?

AI coding tools generate a lot of markdown: `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, planning docs, research notes, changelogs. You need to _read_ these files constantly -- to review agent output, understand decisions, catch mistakes.

Your code editor treats them as just another file. Generic markdown apps miss the context entirely.

Folio is purpose-built for this workflow:

- **AI-aware sidebar** -- `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `AGENTS.md`, and `copilot-instructions.md` get highlighted with badges so you find them instantly.
- **Directory watcher** -- Point it at a project folder. New and changed files appear automatically with debounced updates.
- **Cross-file search** -- `Ctrl+Shift+F` to search across every markdown file in the folder. Find that one decision buried three docs deep.
- **Tabs with session restore** -- Open tabs persist across restarts. Pick up where you left off.

No editing. No bloat. Just reading AI output, done well.

## Quick Start

```bash
npx folio-reader --folder ./my-project
```

That's it. Opens Folio with your project's markdown files in the sidebar.

```bash
# Open a specific file
npx folio-reader README.md

# Open a folder + a file
npx folio-reader --folder ./docs README.md

# Just launch the app
npx folio-reader
```

## Features

**AI file badges** -- Recognizes `CLAUDE.md`, `.cursorrules`, `.clinerules`, `.windsurfrules`, `AGENTS.md`, and `copilot-instructions.md`. These files get a purple badge in the sidebar so they stand out from regular docs.

**Directory watcher** -- Watches your project folder for changes. When an agent writes a new markdown file or updates an existing one, Folio picks it up automatically.

**Cross-file search** -- `Ctrl+Shift+F` opens a project-wide search panel. Results show file name, line matches, and click-to-open.

**Tabbed reading** -- Open multiple files in tabs. Session is restored on restart. `Ctrl+Tab` to switch, `Ctrl+W` to close, `Ctrl+Shift+T` to reopen.

**Outline panel** -- Auto-generated from headings. Click to jump. Essential for long agent-generated docs.

**Dark and light themes** -- Toggle with one click. Follows your system preference by default.

**Syntax highlighting** -- Fenced code blocks with language-aware colors and a one-click copy button.

**Zoom controls** -- Scale content up or down. Saved across sessions.

**Live reload** -- Files auto-reload when changed on disk. Scroll position is preserved.

**PDF export** -- `Ctrl+P` to export any document as a styled PDF.

**In-document search** -- `Ctrl+F` for searching within the current file with match highlighting.

**Status bar** -- Word count and estimated reading time for every document.

<details>
<summary>Screenshots</summary>

| Light mode | Dark mode |
|---|---|
| ![Light](screenshots/light.png) | ![Dark](screenshots/dark.png) |

| Outline panel | Code highlighting |
|---|---|
| ![Outline](screenshots/outline.png) | ![Code](screenshots/code.png) |

</details>

## Installation

### npm (recommended)

```bash
npm install -g folio-reader
folio-reader --folder ./my-project
```

### Download

Grab the latest build from [**Releases**](https://github.com/BharatBheesetti/Folio/releases):

- **Windows** -- `.exe` installer or portable
- **macOS** -- `.dmg` (x64 and Apple Silicon)
- **Linux** -- `.AppImage` or `.deb`

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+O` / `Ctrl+T` | Open file |
| `Ctrl+W` | Close tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `Ctrl+Shift+T` | Reopen closed tab |
| `Ctrl+F` | Search in document |
| `Ctrl+Shift+F` | Search across all files |
| `Ctrl+P` | Export to PDF |

## Build from Source

```bash
git clone https://github.com/BharatBheesetti/Folio.git
cd Folio
npm install
npm start
```

Build a portable `.exe`:

```bash
npm run build
```

Build an installer:

```bash
npm run build:installer
```

## Security

All rendered HTML is sanitized via [sanitize-html](https://github.com/apostrophecams/sanitize-html). No script injection, no iframes, no event handlers. Content Security Policy blocks inline scripts and all outbound network requests. Fonts are bundled locally. DevTools are disabled in production builds. The IPC surface validates file extensions and prevents path traversal.

## Architecture

```
main.js       -- Electron main process: window, IPC, markdown rendering, file watching
preload.js    -- Context bridge: exposes a safe API surface to the renderer
renderer.js   -- UI: tabs, themes, search, outline, sidebar, session persistence
cli.js        -- npx entry point: arg parsing, electron launch
index.html    -- Layout and styling
fonts/        -- Bundled Literata + IBM Plex Mono (WOFF2)
```

## License

[MIT](LICENSE)
