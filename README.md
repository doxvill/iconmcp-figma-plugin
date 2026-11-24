# IconMCP Figma Plugin

A Figma / FigJam plugin for browsing, searching, customizing, and inserting icons from [IconMCP](https://iconmcp.com) (14,490+ outline & duotone icons drawn by AI agents).

## Features

- **Semantic search** via IconMCP's MCP endpoint (`search_icons`)
- **Browse by set & category** (`list_sets`, `get_set`) with infinite scroll
- **Instant preview** for color, stroke width, and size directly in the grid
- **Live customization**: `Outline` / `Duotone`, size (`16`–`48px`), stroke width (`0.75`–`2.5`), corner radius (`0`–`4`), and color
- **Figma-native insertion**:
  - One-click insert or **Drag & Drop** onto the canvas
  - **As Component** mode (with `SCALE` constraints)
  - **Replace selected** mode (preserves position, parent, layer order, and size)
  - Persistent settings and **Recent** icons via `figma.clientStorage`
- **Context menu** (`Right-click`): Insert, Copy SVG, Copy React (JSX), and **Report issue** (`report_icon`)
- **Request missing icons** (`request_icon`) directly from empty/broad search results or the `+ Request` button
- **Keyboard navigation**: `/` to focus search, Arrow keys to move across the grid, `Enter`/`Space` to insert, `Escape` to close menus/modals
- **Resilient networking**: 12s request timeout, offline detection, and one-click retry

## Development

```bash
npm install
npm run typecheck
npm run build
```

For watch mode:

```bash
npm run watch
```

## Load in Figma Desktop

1. Open **Figma Desktop**
2. Go to **Plugins → Development → Import plugin from manifest...**
3. Select `manifest.json` from this repository
4. Run **IconMCP** from **Plugins → Development → IconMCP**

## Community Assets

Placeholder vector assets for Figma Community publishing are in `assets/`:
- `assets/icon.svg` (`128×128`)
- `assets/cover.svg` (`1920×960`)
