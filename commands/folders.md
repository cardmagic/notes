---
description: List Apple Notes folders
allowed-tools: Bash(notes:*)
argument-hint: [limit]
---

# List Folders

List all Apple Notes folders with note counts.

## Instructions

1. Check if the notes CLI is installed:
```bash
command -v notes || pnpm add -g @cardmagic/notes
```

2. List folders:
```bash
notes folders ${ARGUMENTS:+-l $ARGUMENTS}
```

## Examples

- `/notes:folders` - Show all folders
- `/notes:folders 10` - Show top 10 folders
