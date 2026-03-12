# Getting Started with Folio

Folio is a **minimal, beautiful** markdown reader built with Electron. It renders `.md` files with *gorgeous typography* and syntax highlighting.

## Features

- Tabbed interface with session restore
- Live reload when files change on disk
- Light and dark themes
- Table of contents outline panel
- Export to PDF

> "Simplicity is the ultimate sophistication." — Leonardo da Vinci

## Code Highlighting

Folio uses [highlight.js](https://highlightjs.org/) for syntax coloring across 190+ languages.

```javascript
function fibonacci(n) {
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}

// Generate first 10 numbers
const sequence = Array.from({ length: 10 }, (_, i) => fibonacci(i));
console.log(sequence); // [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
```

### Python Example

```python
from pathlib import Path

def find_markdown_files(directory: str) -> list[Path]:
    """Recursively find all markdown files."""
    root = Path(directory)
    return sorted(root.rglob("*.md"))

for md in find_markdown_files("./docs"):
    print(f"Found: {md.name}")
```

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+T` | Open file |
| `Ctrl+W` | Close tab |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+T` | Reopen closed tab |
| `Ctrl+F` | Find in page |
| `Ctrl+P` | Export to PDF |

## Task Lists

- [x] Markdown rendering with GFM
- [x] Syntax highlighting
- [x] Dark mode
- [x] Tab management
- [ ] Plugin system
- [ ] Custom themes

---

Built with care. Open source under MIT license.
