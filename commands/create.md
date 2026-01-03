---
description: Create a new Apple Note
allowed-tools: Bash(notes:*)
argument-hint: <title> --body "content" [--folder "Folder"]
---

# Create Note

Create a new note in Apple Notes.

## Instructions

1. Check if the notes CLI is installed:
```bash
command -v notes || pnpm add -g @cardmagic/notes
```

2. Create the note:
```bash
notes create "$ARGUMENTS"
```

## Examples

- `/notes:create "Meeting Notes" --body "Agenda items..."` - Create a note with content
- `/notes:create "Shopping List" --body "Milk, Eggs" --folder "Personal"` - Create in specific folder
