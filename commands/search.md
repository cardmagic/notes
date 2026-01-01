---
description: Search Apple Notes with fuzzy matching
allowed-tools: Bash(notes:*)
argument-hint: <query>
---

# Search Notes

Search through Apple Notes using fuzzy matching.

## Instructions

1. Check if the notes CLI is installed:
```bash
command -v notes || pnpm add -g @cardmagic/notes
```

2. Run the search:
```bash
notes search "$ARGUMENTS"
```

## Examples

- `/notes:search recipe` - Find notes about recipes
- `/notes:search "tax 2024"` - Find tax-related notes from 2024
