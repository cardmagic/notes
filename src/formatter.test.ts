import { describe, it, expect, beforeAll } from 'vitest';
import chalk from 'chalk';
import {
  formatDate,
  formatNote,
  formatSearchResult,
  formatFolder,
  formatStats,
  formatIndexProgress,
  formatNoteList,
  formatSearchResults,
  formatFolderList,
} from './formatter.js';
import type { IndexedNote, SearchResult, FolderInfo, IndexStats } from './types.js';

// Disable chalk colors for predictable assertions in CI
beforeAll(() => {
  chalk.level = 0;
});

function makeNote(overrides: Partial<IndexedNote> = {}): IndexedNote {
  return {
    id: 1,
    title: 'Test Note',
    snippet: 'A snippet of text',
    body: 'Full body content here',
    folder: 'Notes',
    createdAt: 1704067200,
    modifiedAt: 1704153600,
    isPinned: false,
    isLocked: false,
    ...overrides,
  };
}

function makeSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    ...makeNote(),
    score: 5.5,
    matchedTerms: ['test'],
    ...overrides,
  };
}

describe('formatDate', () => {
  it('returns "Unknown" for 0 timestamp', () => {
    expect(formatDate(0)).toBe('Unknown');
  });

  it('returns "Unknown" for negative timestamp', () => {
    expect(formatDate(-1)).toBe('Unknown');
  });

  it('returns a formatted date string for a valid timestamp', () => {
    const result = formatDate(1704067200);
    // Should be a non-empty string with a year in it
    expect(result.length).toBeGreaterThan(5);
    expect(result).toMatch(/\d{4}/); // contains a 4-digit year
  });
});

describe('formatNote', () => {
  it('includes the title', () => {
    const output = formatNote(makeNote({ title: 'My Note' }));
    expect(output).toContain('My Note');
  });

  it('includes the folder and ID', () => {
    const output = formatNote(makeNote({ folder: 'Work', id: 42 }));
    expect(output).toContain('Work');
    expect(output).toContain('ID: 42');
  });

  it('includes the snippet', () => {
    const output = formatNote(makeNote({ snippet: 'hello world' }));
    expect(output).toContain('hello world');
  });

  it('shows "Untitled" for notes without a title', () => {
    const output = formatNote(makeNote({ title: '' }));
    expect(output).toContain('Untitled');
  });

  it('shows pin indicator for pinned notes', () => {
    const output = formatNote(makeNote({ isPinned: true }));
    expect(output).toContain('📌');
  });

  it('shows lock indicator for locked notes', () => {
    const output = formatNote(makeNote({ isLocked: true }));
    expect(output).toContain('🔒');
  });

  it('does not show body by default', () => {
    const output = formatNote(makeNote({ body: 'secret body' }));
    expect(output).not.toContain('secret body');
  });

  it('shows body preview when showBody is true', () => {
    const output = formatNote(makeNote({ body: 'visible body' }), true);
    expect(output).toContain('visible body');
  });

  it('truncates long body to 200 chars with ellipsis', () => {
    const longBody = 'a'.repeat(300);
    const output = formatNote(makeNote({ body: longBody }), true);
    expect(output).toContain('...');
  });
});

describe('formatSearchResult', () => {
  it('includes the title and query highlight info', () => {
    const output = formatSearchResult(makeSearchResult({ title: 'Meeting Notes' }), 'meeting');
    expect(output).toContain('Meeting');
  });

  it('includes score and matched terms', () => {
    const output = formatSearchResult(makeSearchResult({ score: 3.14, matchedTerms: ['hello'] }), 'hello');
    expect(output).toContain('3.14');
    expect(output).toContain('hello');
  });

  it('includes folder and ID', () => {
    const output = formatSearchResult(makeSearchResult({ folder: 'Work', id: 7 }), 'test');
    expect(output).toContain('Work');
    expect(output).toContain('ID: 7');
  });
});

describe('formatFolder', () => {
  it('includes folder name and note count', () => {
    const folder: FolderInfo = { id: 1, name: 'Projects', noteCount: 15, lastModified: 1704067200 };
    const output = formatFolder(folder);
    expect(output).toContain('Projects');
    expect(output).toContain('15 notes');
  });
});

describe('formatStats', () => {
  it('includes all stats fields', () => {
    const stats: IndexStats = {
      totalNotes: 100,
      totalFolders: 5,
      indexedAt: '2024-01-01T00:00:00Z',
      oldestNote: '2020-01-01',
      newestNote: '2024-01-01',
    };
    const output = formatStats(stats);
    expect(output).toContain('100');
    expect(output).toContain('5');
    expect(output).toContain('2024-01-01T00:00:00Z');
    expect(output).toContain('2020-01-01');
    expect(output).toContain('2024-01-01');
  });

  it('omits oldest/newest when null', () => {
    const stats: IndexStats = {
      totalNotes: 0,
      totalFolders: 0,
      indexedAt: '2024-01-01',
      oldestNote: null,
      newestNote: null,
    };
    const output = formatStats(stats);
    expect(output).not.toContain('Oldest Note');
    expect(output).not.toContain('Newest Note');
  });
});

describe('formatIndexProgress', () => {
  it('shows reading phase', () => {
    const output = formatIndexProgress({ phase: 'reading', current: 50, total: 100 });
    expect(output).toContain('Reading notes');
    expect(output).toContain('50%');
    expect(output).toContain('50/100');
  });

  it('shows indexing phase', () => {
    const output = formatIndexProgress({ phase: 'indexing', current: 100, total: 100 });
    expect(output).toContain('Building index');
    expect(output).toContain('100%');
  });

  it('shows done phase', () => {
    const output = formatIndexProgress({ phase: 'done', current: 0, total: 0 });
    expect(output).toContain('Done');
  });

  it('shows extracting PDFs phase', () => {
    const output = formatIndexProgress({ phase: 'extracting-pdfs', current: 3, total: 10 });
    expect(output).toContain('Extracting PDFs');
    expect(output).toContain('30%');
  });

  it('handles zero total without crashing', () => {
    const output = formatIndexProgress({ phase: 'reading', current: 0, total: 0 });
    expect(output).toContain('0%');
  });
});

describe('formatNoteList', () => {
  it('returns "No notes found" for empty array', () => {
    const output = formatNoteList([]);
    expect(output).toContain('No notes found');
  });

  it('formats multiple notes separated by blank lines', () => {
    const notes = [makeNote({ title: 'Note A' }), makeNote({ title: 'Note B' })];
    const output = formatNoteList(notes);
    expect(output).toContain('Note A');
    expect(output).toContain('Note B');
  });
});

describe('formatSearchResults', () => {
  it('returns "No results found" for empty array', () => {
    const output = formatSearchResults([], 'test');
    expect(output).toContain('No results found');
    expect(output).toContain('test');
  });

  it('formats multiple results', () => {
    const results = [
      makeSearchResult({ title: 'Result A' }),
      makeSearchResult({ title: 'Result B' }),
    ];
    const output = formatSearchResults(results, 'test');
    expect(output).toContain('Result A');
    expect(output).toContain('Result B');
  });
});

describe('formatFolderList', () => {
  it('returns "No folders found" for empty array', () => {
    const output = formatFolderList([]);
    expect(output).toContain('No folders found');
  });

  it('formats multiple folders', () => {
    const folders: FolderInfo[] = [
      { id: 1, name: 'Work', noteCount: 10, lastModified: 1704067200 },
      { id: 2, name: 'Personal', noteCount: 5, lastModified: 1704067200 },
    ];
    const output = formatFolderList(folders);
    expect(output).toContain('Work');
    expect(output).toContain('Personal');
  });
});
