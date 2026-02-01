---
description: Edit an existing Apple Note
allowed-tools: Bash(notes:*)
argument-hint: <id> --body "new content" [--folder "Folder"]
---

# Edit Note

Edit an existing note in Apple Notes. The created timestamp is preserved.

## Instructions

1. Check if the notes CLI is installed:
```bash
command -v notes || pnpm add -g @cardmagic/notes
```

2. Edit the note:
```bash
notes edit $ARGUMENTS
```

## Examples

- `/notes:edit 123 --body "Updated content"` - Edit note by ID
- `/notes:edit --title "Meeting Notes" --body "New agenda"` - Edit by title
- `/notes:edit --title "Todo" --body "New tasks" --folder "Work"` - Edit with folder disambiguation

## Workflow

1. Find the note: `notes search "keyword"` or `notes recent`
2. Read current content: `notes read <id>`
3. Edit the note: `notes edit <id> --body "new content"`
