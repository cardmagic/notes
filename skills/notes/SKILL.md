---
name: notes
description: Search and browse Apple Notes. Use when user asks about notes, wants to find something in notes, or list their notes.
triggers:
  - "notes"
  - "apple notes"
  - "find note"
  - "search notes"
  - "my notes"
  - "list notes"
  - "read note"
---

# Apple Notes Skill

Search and browse Apple Notes with fuzzy matching.

## Prerequisites

Ensure the notes CLI is installed:

```bash
if ! command -v notes &> /dev/null; then
  pnpm add -g @cardmagic/notes
fi
```

## Commands

### Search notes
```bash
notes search "query" [-l limit] [-f folder] [-a after_date]
```

### Recent notes
```bash
notes recent [-l limit]
```

### Read a note by ID
```bash
notes read <id>
```

### List folders
```bash
notes folders [-l limit]
```

### Notes in folder
```bash
notes folder "folder_name" [-l limit]
```

### Index statistics
```bash
notes stats
```

### Rebuild index
```bash
notes index [-f|--force]
```

## Examples

- Search for "recipe": `notes search "recipe"`
- Recent notes: `notes recent`
- Notes in Taxes folder: `notes folder Taxes`
- Read note ID 123: `notes read 123`
