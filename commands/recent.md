---
description: Show recently modified Apple Notes
allowed-tools: Bash(notes:*)
argument-hint: [limit]
---

# Recent Notes

Show the most recently modified Apple Notes.

## Instructions

1. Check if the notes CLI is installed:
```bash
command -v notes || pnpm add -g @cardmagic/notes
```

2. Get recent notes:
```bash
notes recent ${ARGUMENTS:+-l $ARGUMENTS}
```

## Examples

- `/notes:recent` - Show 20 most recent notes
- `/notes:recent 10` - Show 10 most recent notes
