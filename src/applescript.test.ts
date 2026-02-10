import { describe, it, expect } from 'vitest';
import { escapeAppleScript, escapeHtml, buildNoteOperationScript } from './applescript.js';

describe('escapeAppleScript', () => {
  it('escapes backslashes', () => {
    expect(escapeAppleScript('a\\b')).toBe('a\\\\b');
  });

  it('escapes double quotes', () => {
    expect(escapeAppleScript('say "hello"')).toBe('say \\"hello\\"');
  });

  it('escapes newlines', () => {
    expect(escapeAppleScript('line1\nline2')).toBe('line1\\nline2');
  });

  it('escapes carriage returns', () => {
    expect(escapeAppleScript('line1\rline2')).toBe('line1\\rline2');
  });

  it('escapes tabs', () => {
    expect(escapeAppleScript('col1\tcol2')).toBe('col1\\tcol2');
  });

  it('strips control characters', () => {
    expect(escapeAppleScript('hello\x01\x02world')).toBe('helloworld');
  });

  it('handles combined escaping', () => {
    const input = 'He said "hello\\world"\nEnd';
    const expected = 'He said \\"hello\\\\world\\"\\nEnd';
    expect(escapeAppleScript(input)).toBe(expected);
  });

  it('passes through normal strings unchanged', () => {
    expect(escapeAppleScript('Hello, World!')).toBe('Hello, World!');
  });

  it('handles empty strings', () => {
    expect(escapeAppleScript('')).toBe('');
  });
});

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });

  it('escapes less-than signs', () => {
    expect(escapeHtml('a<b')).toBe('a&lt;b');
  });

  it('escapes greater-than signs', () => {
    expect(escapeHtml('a>b')).toBe('a&gt;b');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('a"b')).toBe('a&quot;b');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("a'b")).toBe('a&#39;b');
  });

  it('escapes all HTML entities in a complex string', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('passes through normal strings unchanged', () => {
    expect(escapeHtml('Hello, World!')).toBe('Hello, World!');
  });

  it('handles empty strings', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('buildNoteOperationScript', () => {
  it('generates script without folder scope', () => {
    const script = buildNoteOperationScript('My Note', 'delete targetNote');
    expect(script).toContain('tell application "Notes"');
    expect(script).toContain('whose name is "My Note"');
    expect(script).toContain('delete targetNote');
    expect(script).not.toContain('set targetFolder');
  });

  it('generates script with folder scope', () => {
    const script = buildNoteOperationScript('My Note', 'delete targetNote', 'Work');
    expect(script).toContain('set targetFolder to folder "Work"');
    expect(script).toContain('notes of targetFolder');
    expect(script).toContain('whose name is "My Note"');
  });

  it('escapes title in the script', () => {
    const script = buildNoteOperationScript('Note "with quotes"', 'delete targetNote');
    expect(script).toContain('whose name is "Note \\"with quotes\\""');
  });

  it('escapes folder name in the script', () => {
    const script = buildNoteOperationScript('Test', 'delete targetNote', 'My "Folder"');
    expect(script).toContain('folder "My \\"Folder\\""');
  });

  it('includes error handling for note not found', () => {
    const script = buildNoteOperationScript('Test', 'delete targetNote');
    expect(script).toContain('count of matchingNotes');
    expect(script).toContain('error "Note not found"');
  });
});
