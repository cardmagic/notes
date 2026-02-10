import { describe, it, expect } from 'vitest';

// These functions are private in applescript.ts, so we test them
// by importing the module and exercising the logic indirectly,
// or we can re-implement the pure functions here for unit testing.
// Since they're not exported, we test them as standalone pure functions.

// Mirror of escapeAppleScript from applescript.ts
function escapeAppleScript(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, '');
}

// Mirror of escapeHtml from applescript.ts
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
