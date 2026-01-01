---
description: List notes in a specific folder
allowed-tools: Bash(notes:*)
argument-hint: <folder_name>
---

# Notes in Folder

List all notes in a specific Apple Notes folder.

## Instructions

1. Check if the notes CLI is installed:
```bash
command -v notes || pnpm add -g @cardmagic/notes
```

2. List notes in folder:
```bash
notes folder "$ARGUMENTS"
```

## Examples

- `/notes:folder Taxes` - List notes in Taxes folder
- `/notes:folder "Business Ideas"` - List notes in Business Ideas folder
