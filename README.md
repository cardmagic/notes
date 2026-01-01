# @cardmagic/notes

CLI and MCP server to search and browse Apple Notes with fuzzy matching.

## Features

- **Fuzzy search** - Find notes even with typos using MiniSearch
- **Full-text search** - Searches note titles, snippets, and body content
- **PDF text extraction** - Automatically extracts and indexes text from PDF attachments
- **Folder browsing** - List and filter notes by folder
- **Fast indexing** - SQLite FTS5 + MiniSearch for quick searches across thousands of notes
- **Dual mode** - Use as CLI tool or MCP server for Claude Code integration

## Installation

```bash
# Install globally
npm install -g @cardmagic/notes

# Or with pnpm
pnpm add -g @cardmagic/notes
```

### Requirements

- **macOS** - Reads from Apple Notes database
- **Full Disk Access** - Terminal/IDE needs access to `~/Library/Group Containers/`
- **pdftotext** (optional) - For PDF text extraction

```bash
# Install pdftotext for PDF support
brew install poppler
```

## CLI Usage

### Search notes

```bash
# Fuzzy search
notes search "recipe chocolate"

# Filter by folder
notes search "taxes" --folder "2024"

# Limit results
notes search "meeting" --limit 5

# Filter by date
notes search "project" --after 2024-01-01
```

### Browse notes

```bash
# Recent notes
notes recent
notes recent --limit 10

# List all folders
notes folders

# Notes in a specific folder
notes folder "Recipes"
notes folder "Work" --limit 20
```

### Read a note

```bash
# Get note ID from search results, then read full content
notes read 12345
```

### Manage index

```bash
# Show index statistics
notes stats

# Update index (incremental - only processes changed notes)
notes index

# Force full rebuild
notes index --force
```

The index uses **incremental updates** by default:
- Tracks modification timestamps to detect changed notes
- Only reprocesses notes modified since last index
- Detects and removes deleted notes
- Much faster than full rebuild for small changes

## MCP Server

Run as an MCP server for Claude Code integration:

```bash
notes --mcp
```

### Available Tools

| Tool | Description |
|------|-------------|
| `search_notes` | Fuzzy search through notes |
| `recent_notes` | Get recently modified notes |
| `read_note` | Read full note content by ID |
| `list_folders` | List all folders with note counts |
| `notes_in_folder` | List notes in a specific folder |
| `get_note_stats` | Get index statistics |

### Claude Code Configuration

Add to your MCP settings:

```json
{
  "mcpServers": {
    "notes": {
      "command": "notes",
      "args": ["--mcp"]
    }
  }
}
```

## PDF Text Extraction

PDF attachments in Notes are automatically extracted and indexed when:

1. **pdftotext is installed** - `brew install poppler`
2. **PDF has been viewed** - Notes caches PDFs locally when opened

The extracted text is appended to the note body, making PDF content fully searchable.

### How it works

- PDFs are cached at `~/Library/Group Containers/group.com.apple.notes/Library/Caches/Paper/`
- Each PDF bundle contains the file in `Assets.bundle/`
- Text is extracted using `pdftotext` and indexed with the parent note

### Limitations

- PDFs stored only in iCloud (never opened locally) won't be indexed
- Password-protected PDFs cannot be extracted
- Scanned PDFs without OCR won't have searchable text

## Data Locations

| Data | Path |
|------|------|
| Notes database | `~/Library/Group Containers/group.com.apple.notes/NoteStore.sqlite` |
| PDF cache | `~/Library/Group Containers/group.com.apple.notes/Library/Caches/Paper/` |
| Search index | `~/.notes/index.db` |
| Fuzzy index | `~/.notes/fuzzy.json` |
| Stats | `~/.notes/stats.json` |

## Development

```bash
# Clone and install
git clone https://github.com/cardmagic/notes
cd notes
pnpm install

# Build
pnpm build

# Watch mode
pnpm dev

# Link globally for testing
pnpm link --global

# Type check
pnpm typecheck

# Lint
pnpm lint
```

### Project Structure

```
src/
├── index.ts        # Entry point - routes to CLI or MCP
├── cli.ts          # Commander-based CLI
├── mcp.ts          # MCP server implementation
├── indexer.ts      # Builds search indexes from Notes database
├── searcher.ts     # Query engine with fuzzy matching
├── attachments.ts  # PDF text extraction
├── formatter.ts    # Terminal output formatting
└── types.ts        # TypeScript types and utilities
```

## Privacy

This tool only reads your local Notes database. No data is sent externally. The search index is stored locally in `~/.notes/`.

## License

MIT

## Author

Lucas Carlson
