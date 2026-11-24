# IconMCP Figma Plugin

A Figma / FigJam plugin for browsing, searching, customizing, and inserting icons from [IconMCP](https://iconmcp.com) (14,490+ outline & duotone icons drawn by AI agents).

## Features

- **Semantic search** via IconMCP's MCP endpoint (`search_icons`)
- **Browse by set & category** (`list_sets`, `get_set`)
- **Live customization**: `Outline` / `Duotone`, size (`16`–`48px`), stroke width, corner radius, and color
- **One-click insert** as editable vector nodes in Figma (`Right-click` to copy SVG)

## Development

```bash
npm install
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
