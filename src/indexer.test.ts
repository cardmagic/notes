import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { extractTextFromNoteData, extractStringsFromBuffer, processNote } from './indexer.js';
import type { RawNote } from './types.js';

describe('extractStringsFromBuffer', () => {
  it('extracts ASCII strings from a buffer', () => {
    // Simulate a buffer with readable text surrounded by binary junk
    const text = 'Hello World';
    const buf = Buffer.concat([
      Buffer.from([0x00, 0x01, 0x02]),
      Buffer.from(text, 'utf-8'),
      Buffer.from([0x00, 0x03]),
    ]);
    const result = extractStringsFromBuffer(buf);
    expect(result).toContain('Hello World');
  });

  it('joins multiple string segments', () => {
    const buf = Buffer.concat([
      Buffer.from('First segment here', 'utf-8'),
      Buffer.from([0x00, 0x00, 0x00]),
      Buffer.from('Second segment here', 'utf-8'),
    ]);
    const result = extractStringsFromBuffer(buf);
    expect(result).toContain('First segment here');
    expect(result).toContain('Second segment here');
  });

  it('skips very short strings (< 3 chars)', () => {
    const buf = Buffer.concat([
      Buffer.from('Hi', 'utf-8'),
      Buffer.from([0x00]),
      Buffer.from('This is longer text', 'utf-8'),
    ]);
    const result = extractStringsFromBuffer(buf);
    expect(result).toContain('This is longer text');
    // "Hi" alone should not appear as its own line (too short to be pushed)
  });

  it('handles empty buffer', () => {
    const result = extractStringsFromBuffer(Buffer.alloc(0));
    expect(result).toBe('');
  });

  it('handles buffer with only binary data', () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
    const result = extractStringsFromBuffer(buf);
    expect(result).toBe('');
  });

  it('preserves newlines and tabs in strings', () => {
    const text = 'Line one\nLine two\tTabbed';
    const buf = Buffer.from(text, 'utf-8');
    const result = extractStringsFromBuffer(buf);
    expect(result).toContain('Line one');
    expect(result).toContain('Line two');
  });

  it('filters out garbage lines with short exotic characters', () => {
    const buf = Buffer.concat([
      Buffer.from('Normal text content here', 'utf-8'),
      Buffer.from([0x00]),
      // Simulate garbage-like short strings
      Buffer.from('F>LL', 'utf-8'),
      Buffer.from([0x00]),
      Buffer.from('MbH', 'utf-8'),
      Buffer.from([0x00]),
      Buffer.from('Xyz', 'utf-8'),
    ]);
    const result = extractStringsFromBuffer(buf);
    expect(result).toContain('Normal text content here');
  });
});

describe('extractTextFromNoteData', () => {
  it('returns empty string for null data', () => {
    expect(extractTextFromNoteData(null)).toBe('');
  });

  it('returns empty string for empty buffer', () => {
    expect(extractTextFromNoteData(Buffer.alloc(0))).toBe('');
  });

  it('extracts text from gzipped data', () => {
    const text = 'This is a test note with enough characters to pass filtering';
    // Pad with some binary to simulate protobuf structure
    const rawData = Buffer.concat([
      Buffer.from([0x08, 0x01, 0x12]),
      Buffer.from(text, 'utf-8'),
      Buffer.from([0x00]),
    ]);
    const gzipped = gzipSync(rawData);
    const result = extractTextFromNoteData(gzipped);
    expect(result).toContain('This is a test note');
  });

  it('returns empty string for invalid gzip data', () => {
    const invalidData = Buffer.from('not gzipped data', 'utf-8');
    expect(extractTextFromNoteData(invalidData)).toBe('');
  });
});

describe('processNote', () => {
  function makeRawNote(overrides: Partial<RawNote> = {}): RawNote {
    return {
      rowid: 1,
      title: 'Test Note',
      snippet: 'A snippet',
      folderId: 1,
      folderName: 'Notes',
      creationDate: 725760000, // 2024-01-01 in Apple epoch
      modificationDate: 725846400,
      isPinned: 0,
      isPasswordProtected: 0,
      data: null,
      ...overrides,
    };
  }

  it('transforms a raw note to indexed format', () => {
    const result = processNote(makeRawNote(), new Map());
    expect(result.id).toBe(1);
    expect(result.title).toBe('Test Note');
    expect(result.snippet).toBe('A snippet');
    expect(result.folder).toBe('Notes');
    expect(result.isPinned).toBe(false);
    expect(result.isLocked).toBe(false);
  });

  it('converts Apple timestamps to Unix timestamps', () => {
    const result = processNote(makeRawNote({ creationDate: 725760000 }), new Map());
    expect(result.createdAt).toBe(725760000 + 978307200); // 1704067200
  });

  it('handles null creation/modification dates', () => {
    const result = processNote(
      makeRawNote({ creationDate: null, modificationDate: null }),
      new Map()
    );
    expect(result.createdAt).toBe(0);
    expect(result.modifiedAt).toBe(0);
  });

  it('handles null title and snippet', () => {
    const result = processNote(
      makeRawNote({ title: null, snippet: null, folderName: null }),
      new Map()
    );
    expect(result.title).toBe('');
    expect(result.snippet).toBe('');
    expect(result.folder).toBe('Notes');
  });

  it('sets isPinned from raw data', () => {
    const result = processNote(makeRawNote({ isPinned: 1 }), new Map());
    expect(result.isPinned).toBe(true);
  });

  it('sets isLocked from password protection', () => {
    const result = processNote(makeRawNote({ isPasswordProtected: 1 }), new Map());
    expect(result.isLocked).toBe(true);
  });

  it('appends PDF text when available', () => {
    const pdfMap = new Map([['note_1', 'PDF content here']]);
    const result = processNote(makeRawNote(), pdfMap);
    expect(result.body).toContain('PDF content here');
  });

  it('combines body text with PDF text', () => {
    const text = 'Note body text that is long enough to pass the filter';
    const rawData = Buffer.concat([
      Buffer.from([0x08, 0x01, 0x12]),
      Buffer.from(text, 'utf-8'),
      Buffer.from([0x00]),
    ]);
    const gzipped = gzipSync(rawData);
    const pdfMap = new Map([['note_1', 'PDF appendix']]);
    const result = processNote(makeRawNote({ data: gzipped }), pdfMap);
    expect(result.body).toContain('Note body text');
    expect(result.body).toContain('PDF appendix');
  });
});
