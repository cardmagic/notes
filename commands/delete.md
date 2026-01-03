---
description: Delete an Apple Note by title
allowed-tools: Bash(notes:*)
argument-hint: <title> [--folder "Folder"]
---

# Delete Note

Delete a note from Apple Notes by its title.

## Instructions

1. Check if the notes CLI is installed:
```bash
command -v notes || pnpm add -g @cardmagic/notes
```

2. Delete the note:
```bash
notes delete "$ARGUMENTS"
```

## Examples

- `/notes:delete "Old Meeting Notes"` - Delete a note by title
- `/notes:delete "Draft" --folder "Work"` - Delete from specific folder (useful if multiple notes have the same title)
