---
description: Read an Apple Note by ID
allowed-tools: Bash(notes:*)
argument-hint: <note_id>
---

# Read Note

Read the full content of an Apple Note by its ID.

## Instructions

1. Check if the notes CLI is installed:
```bash
command -v notes || pnpm add -g @cardmagic/notes
```

2. Read the note:
```bash
notes read $ARGUMENTS
```

## Examples

- `/notes:read 123` - Read note with ID 123
