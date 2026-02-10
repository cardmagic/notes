import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import MiniSearch from 'minisearch';
import type { RawNote, IndexedNote, IndexStats } from './types.js';
import { appleToUnix, appleToDate } from './types.js';
import { extractAllPdfText, getNoteKey } from './attachments.js';

const NOTES_DB_PATH = join(
  homedir(),
  'Library/Group Containers/group.com.apple.notes/NoteStore.sqlite'
);

const INDEX_DIR = join(homedir(), '.notes');
const INDEX_DB_PATH = join(INDEX_DIR, 'index.db');
const FUZZY_INDEX_PATH = join(INDEX_DIR, 'fuzzy.json');
const STATS_PATH = join(INDEX_DIR, 'stats.json');

// Entity type constants from Z_PRIMARYKEY
const ENTITY_NOTE = 12;
const ENTITY_FOLDER = 15;

function ensureIndexDir(): void {
  if (!existsSync(INDEX_DIR)) {
    mkdirSync(INDEX_DIR, { recursive: true });
  }
}

export function extractTextFromNoteData(data: Buffer | null): string {
  if (!data || data.length === 0) {
    return '';
  }

  try {
    // The data is gzip compressed
    const decompressed = gunzipSync(data);

    // Extract readable text from the protobuf-like format
    // The text is stored as UTF-8 strings within the binary data
    const text = extractStringsFromBuffer(decompressed);
    return text;
  } catch {
    return '';
  }
}

export function extractStringsFromBuffer(buffer: Buffer): string {
  const strings: string[] = [];
  let currentString = '';
  let inString = false;

  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];

    // Check if this is a printable ASCII or common UTF-8 character
    if ((byte >= 0x20 && byte <= 0x7E) || byte === 0x0A || byte === 0x0D || byte === 0x09) {
      currentString += String.fromCharCode(byte);
      inString = true;
    } else if (byte >= 0xC0 && byte <= 0xF7 && i + 1 < buffer.length) {
      // Handle UTF-8 multi-byte sequences
      let charLen = 1;
      if ((byte & 0xE0) === 0xC0) charLen = 2;
      else if ((byte & 0xF0) === 0xE0) charLen = 3;
      else if ((byte & 0xF8) === 0xF0) charLen = 4;

      if (i + charLen <= buffer.length) {
        try {
          const utf8Char = buffer.slice(i, i + charLen).toString('utf8');
          if (utf8Char.length === 1 && utf8Char.charCodeAt(0) >= 0x80) {
            currentString += utf8Char;
            i += charLen - 1;
            inString = true;
            continue;
          }
        } catch {
          // Not valid UTF-8
        }
      }

      if (inString && currentString.length >= 3) {
        strings.push(currentString.trim());
      }
      currentString = '';
      inString = false;
    } else {
      if (inString && currentString.length >= 3) {
        strings.push(currentString.trim());
      }
      currentString = '';
      inString = false;
    }
  }

  if (currentString.length >= 3) {
    strings.push(currentString.trim());
  }

  // Join strings and clean up
  const text = strings
    .filter(s => s.length >= 2)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    // Remove any remaining non-printable characters except newlines/tabs
    .replace(/[^\x20-\x7E\n\t\u00A0-\uFFFF]/g, '')
    .trim();

  // Filter out garbage lines and detect where garbage starts
  const lines = text.split('\n');

  // Helper to detect if a line is garbage
  const isGarbageLine = (line: string): boolean => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return false; // Empty lines aren't garbage

    // Lines with characters outside basic Latin + common punctuation
    const hasExoticChars = /[^\x20-\x7E\u00A0-\u00FF]/.test(trimmed);

    // Short lines with exotic chars are definitely garbage
    if (hasExoticChars && trimmed.length < 20) return true;

    // Lines that are mostly non-alphanumeric
    const alphanumCount = (trimmed.match(/[a-zA-Z0-9]/g) || []).length;
    if (alphanumCount < trimmed.length * 0.4 && trimmed.length < 15) return true;

    // Short alphanumeric-only codes that repeat (like "F>LL", "MbH", etc.)
    if (trimmed.length <= 5 && /^[A-Za-z0-9>\\]+$/.test(trimmed)) return true;

    return false;
  };

  // Find where a garbage block starts (3+ consecutive garbage lines)
  let cutoffIndex = lines.length;
  let consecutiveGarbage = 0;

  for (let i = 0; i < lines.length; i++) {
    if (isGarbageLine(lines[i])) {
      consecutiveGarbage++;
      if (consecutiveGarbage >= 3) {
        // Found garbage block, cut from where it started
        cutoffIndex = i - consecutiveGarbage + 1;
        break;
      }
    } else if (lines[i].trim().length > 0) {
      consecutiveGarbage = 0;
    }
  }

  return lines.slice(0, cutoffIndex).join('\n').trim();
}

export function indexNeedsRebuild(): boolean {
  if (!existsSync(INDEX_DB_PATH) || !existsSync(FUZZY_INDEX_PATH)) {
    return true;
  }

  try {
    const sourceStats = statSync(NOTES_DB_PATH);
    const indexStats = statSync(INDEX_DB_PATH);
    return sourceStats.mtimeMs > indexStats.mtimeMs;
  } catch {
    return true;
  }
}

export interface IndexProgress {
  phase: 'reading' | 'extracting-pdfs' | 'indexing' | 'done';
  current: number;
  total: number;
  message?: string;
}

interface ExtendedStats extends IndexStats {
  lastIndexedModTime?: number; // Apple timestamp of most recent note at last index
}

function getExtendedStats(): ExtendedStats | null {
  try {
    if (!existsSync(STATS_PATH)) {
      return null;
    }
    return JSON.parse(readFileSync(STATS_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function createIndexTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY,
      title TEXT,
      snippet TEXT,
      body TEXT,
      folder TEXT,
      created_at INTEGER,
      modified_at INTEGER,
      is_pinned INTEGER,
      is_locked INTEGER
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      title,
      snippet,
      body,
      folder,
      content='notes',
      content_rowid='id'
    );

    CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder);
    CREATE INDEX IF NOT EXISTS idx_notes_modified ON notes(modified_at);
  `);
}

export function processNote(
  raw: RawNote,
  pdfTextByNote: Map<string, string>
): IndexedNote {
  let body = extractTextFromNoteData(raw.data);

  const noteKey = getNoteKey(raw.rowid);
  const pdfText = pdfTextByNote.get(noteKey);
  if (pdfText) {
    body = body ? `${body}\n\n${pdfText}` : pdfText;
  }

  return {
    id: raw.rowid,
    title: raw.title || '',
    snippet: raw.snippet || '',
    body,
    folder: raw.folderName || 'Notes',
    createdAt: raw.creationDate ? appleToUnix(raw.creationDate) : 0,
    modifiedAt: raw.modificationDate ? appleToUnix(raw.modificationDate) : 0,
    isPinned: raw.isPinned === 1,
    isLocked: raw.isPasswordProtected === 1,
  };
}

function rebuildFuzzyIndex(indexDb: Database.Database): void {
  const allNotes = indexDb.prepare(`
    SELECT id, title, snippet, body, folder, created_at as createdAt,
           modified_at as modifiedAt, is_pinned as isPinned, is_locked as isLocked
    FROM notes
  `).all() as IndexedNote[];

  const miniSearch = new MiniSearch<IndexedNote>({
    fields: ['title', 'snippet', 'body', 'folder'],
    storeFields: ['id', 'title', 'snippet', 'folder', 'createdAt', 'modifiedAt', 'isPinned', 'isLocked'],
    searchOptions: {
      fuzzy: 0.2,
      prefix: true,
      boost: { title: 3, snippet: 2, body: 1, folder: 1 },
    },
  });

  miniSearch.addAll(allNotes);
  writeFileSync(FUZZY_INDEX_PATH, JSON.stringify(miniSearch.toJSON()));
}

/**
 * Incremental index update - only processes changed notes
 */
export async function updateIndex(
  onProgress?: (progress: IndexProgress) => void
): Promise<IndexStats & { updated: number; deleted: number }> {
  ensureIndexDir();

  const existingStats = getExtendedStats();
  const lastModTime = existingStats?.lastIndexedModTime || 0;

  const sourceDb = new Database(NOTES_DB_PATH, { readonly: true });
  const indexDb = new Database(INDEX_DB_PATH);

  try {
    createIndexTables(indexDb);

    // Get current note IDs from source to detect deletions
    const currentNoteIds = new Set(
      (sourceDb.prepare(`
        SELECT Z_PK as id FROM ZICCLOUDSYNCINGOBJECT
        WHERE Z_ENT = ? AND ZMARKEDFORDELETION = 0
      `).all(ENTITY_NOTE) as { id: number }[]).map(r => r.id)
    );

    // Get indexed note IDs
    const indexedNoteIds = new Set(
      (indexDb.prepare('SELECT id FROM notes').all() as { id: number }[]).map(r => r.id)
    );

    // Find deleted notes
    const deletedIds: number[] = [];
    for (const id of indexedNoteIds) {
      if (!currentNoteIds.has(id)) {
        deletedIds.push(id);
      }
    }

    // Delete removed notes
    if (deletedIds.length > 0) {
      const deleteStmt = indexDb.prepare('DELETE FROM notes WHERE id = ?');
      const deleteFtsStmt = indexDb.prepare('DELETE FROM notes_fts WHERE rowid = ?');
      indexDb.exec('BEGIN TRANSACTION');
      for (const id of deletedIds) {
        deleteStmt.run(id);
        deleteFtsStmt.run(id);
      }
      indexDb.exec('COMMIT');
    }

    // Query notes modified since last index
    const modifiedNotesQuery = sourceDb.prepare(`
      SELECT
        n.Z_PK as rowid,
        n.ZTITLE1 as title,
        n.ZSNIPPET as snippet,
        n.ZFOLDER as folderId,
        f.ZTITLE2 as folderName,
        COALESCE(n.ZCREATIONDATE, n.ZCREATIONDATE1, n.ZCREATIONDATE2, n.ZCREATIONDATE3) as creationDate,
        COALESCE(n.ZMODIFICATIONDATE, n.ZMODIFICATIONDATE1, n.ZMODIFIEDDATE) as modificationDate,
        n.ZISPINNED as isPinned,
        n.ZISPASSWORDPROTECTED as isPasswordProtected,
        nd.ZDATA as data
      FROM ZICCLOUDSYNCINGOBJECT n
      LEFT JOIN ZICCLOUDSYNCINGOBJECT f ON n.ZFOLDER = f.Z_PK
      LEFT JOIN ZICNOTEDATA nd ON nd.ZNOTE = n.Z_PK
      WHERE n.Z_ENT = ?
        AND n.ZMARKEDFORDELETION = 0
        AND COALESCE(n.ZMODIFICATIONDATE, n.ZMODIFICATIONDATE1, n.ZMODIFIEDDATE) > ?
      ORDER BY COALESCE(n.ZMODIFICATIONDATE, n.ZMODIFICATIONDATE1, n.ZMODIFIEDDATE) ASC
    `);

    const modifiedNotes = modifiedNotesQuery.all(ENTITY_NOTE, lastModTime) as RawNote[];

    if (modifiedNotes.length === 0 && deletedIds.length === 0) {
      onProgress?.({ phase: 'done', current: 0, total: 0, message: 'Index up to date' });
      return { ...existingStats!, updated: 0, deleted: 0 };
    }

    onProgress?.({
      phase: 'extracting-pdfs',
      current: 0,
      total: modifiedNotes.length,
      message: `Found ${modifiedNotes.length} modified, ${deletedIds.length} deleted`
    });

    // Extract PDF text only for modified notes
    let pdfTextByNote: Map<string, string>;
    try {
      pdfTextByNote = extractAllPdfText();
    } catch {
      pdfTextByNote = new Map();
    }

    onProgress?.({ phase: 'reading', current: 0, total: modifiedNotes.length });

    // Upsert modified notes
    const upsertStmt = indexDb.prepare(`
      INSERT OR REPLACE INTO notes (id, title, snippet, body, folder, created_at, modified_at, is_pinned, is_locked)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const deleteFtsForUpdate = indexDb.prepare('DELETE FROM notes_fts WHERE rowid = ?');
    const insertFtsStmt = indexDb.prepare(`
      INSERT INTO notes_fts (rowid, title, snippet, body, folder)
      VALUES (?, ?, ?, ?, ?)
    `);

    let maxModTime = lastModTime;
    indexDb.exec('BEGIN TRANSACTION');

    for (let i = 0; i < modifiedNotes.length; i++) {
      const raw = modifiedNotes[i];
      const note = processNote(raw, pdfTextByNote);

      if (raw.modificationDate && raw.modificationDate > maxModTime) {
        maxModTime = raw.modificationDate;
      }

      upsertStmt.run(
        note.id, note.title, note.snippet, note.body, note.folder,
        note.createdAt, note.modifiedAt, note.isPinned ? 1 : 0, note.isLocked ? 1 : 0
      );

      // Update FTS (delete then insert)
      deleteFtsForUpdate.run(note.id);
      insertFtsStmt.run(note.id, note.title, note.snippet, note.body, note.folder);

      if (i % 50 === 0) {
        onProgress?.({ phase: 'reading', current: i, total: modifiedNotes.length });
      }
    }

    indexDb.exec('COMMIT');

    onProgress?.({ phase: 'indexing', current: 0, total: 1, message: 'Rebuilding fuzzy index...' });

    // Rebuild fuzzy index from SQLite
    rebuildFuzzyIndex(indexDb);

    // Update stats
    const totalNotes = (indexDb.prepare('SELECT COUNT(*) as count FROM notes').get() as { count: number }).count;
    const folderCount = (sourceDb.prepare(`
      SELECT COUNT(*) as count FROM ZICCLOUDSYNCINGOBJECT WHERE Z_ENT = ? AND ZMARKEDFORDELETION = 0
    `).get(ENTITY_FOLDER) as { count: number }).count;

    const dateRange = indexDb.prepare(`
      SELECT MIN(modified_at) as oldest, MAX(modified_at) as newest FROM notes WHERE modified_at > 0
    `).get() as { oldest: number | null; newest: number | null };

    const stats: ExtendedStats = {
      totalNotes,
      totalFolders: folderCount,
      indexedAt: new Date().toISOString(),
      oldestNote: dateRange.oldest ? new Date(dateRange.oldest * 1000).toISOString() : null,
      newestNote: dateRange.newest ? new Date(dateRange.newest * 1000).toISOString() : null,
      lastIndexedModTime: maxModTime,
    };

    writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2));

    onProgress?.({ phase: 'done', current: modifiedNotes.length, total: modifiedNotes.length });

    return { ...stats, updated: modifiedNotes.length, deleted: deletedIds.length };
  } finally {
    sourceDb.close();
    indexDb.close();
  }
}

/**
 * Full index rebuild - processes all notes from scratch
 */
export async function buildIndex(
  onProgress?: (progress: IndexProgress) => void
): Promise<IndexStats> {
  ensureIndexDir();

  const sourceDb = new Database(NOTES_DB_PATH, { readonly: true });

  // Remove old index and create fresh
  if (existsSync(INDEX_DB_PATH)) {
    try {
      const oldDb = new Database(INDEX_DB_PATH);
      oldDb.close();
    } catch { /* ignore */ }
  }

  const indexDb = new Database(INDEX_DB_PATH);

  try {
    // Drop and recreate tables for full rebuild
    indexDb.exec(`
      DROP TABLE IF EXISTS notes_fts;
      DROP TABLE IF EXISTS notes;
    `);
    createIndexTables(indexDb);

    const notesQuery = sourceDb.prepare(`
      SELECT
        n.Z_PK as rowid,
        n.ZTITLE1 as title,
        n.ZSNIPPET as snippet,
        n.ZFOLDER as folderId,
        f.ZTITLE2 as folderName,
        COALESCE(n.ZCREATIONDATE, n.ZCREATIONDATE1, n.ZCREATIONDATE2, n.ZCREATIONDATE3) as creationDate,
        COALESCE(n.ZMODIFICATIONDATE, n.ZMODIFICATIONDATE1, n.ZMODIFIEDDATE) as modificationDate,
        n.ZISPINNED as isPinned,
        n.ZISPASSWORDPROTECTED as isPasswordProtected,
        nd.ZDATA as data
      FROM ZICCLOUDSYNCINGOBJECT n
      LEFT JOIN ZICCLOUDSYNCINGOBJECT f ON n.ZFOLDER = f.Z_PK
      LEFT JOIN ZICNOTEDATA nd ON nd.ZNOTE = n.Z_PK
      WHERE n.Z_ENT = ?
        AND n.ZMARKEDFORDELETION = 0
      ORDER BY COALESCE(n.ZMODIFICATIONDATE, n.ZMODIFICATIONDATE1, n.ZMODIFIEDDATE) ASC
    `);

    const rawNotes = notesQuery.all(ENTITY_NOTE) as RawNote[];
    const totalNotes = rawNotes.length;

    onProgress?.({ phase: 'extracting-pdfs', current: 0, total: totalNotes });

    let pdfTextByNote: Map<string, string>;
    try {
      pdfTextByNote = extractAllPdfText();
    } catch {
      pdfTextByNote = new Map();
    }

    onProgress?.({ phase: 'reading', current: 0, total: totalNotes });

    const insertStmt = indexDb.prepare(`
      INSERT INTO notes (id, title, snippet, body, folder, created_at, modified_at, is_pinned, is_locked)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertFtsStmt = indexDb.prepare(`
      INSERT INTO notes_fts (rowid, title, snippet, body, folder)
      VALUES (?, ?, ?, ?, ?)
    `);

    let maxModTime = 0;
    indexDb.exec('BEGIN TRANSACTION');

    for (let i = 0; i < rawNotes.length; i++) {
      const raw = rawNotes[i];
      const note = processNote(raw, pdfTextByNote);

      if (raw.modificationDate && raw.modificationDate > maxModTime) {
        maxModTime = raw.modificationDate;
      }

      insertStmt.run(
        note.id, note.title, note.snippet, note.body, note.folder,
        note.createdAt, note.modifiedAt, note.isPinned ? 1 : 0, note.isLocked ? 1 : 0
      );

      insertFtsStmt.run(note.id, note.title, note.snippet, note.body, note.folder);

      if (i % 100 === 0) {
        onProgress?.({ phase: 'reading', current: i, total: totalNotes });
      }
    }

    indexDb.exec('COMMIT');

    onProgress?.({ phase: 'indexing', current: 0, total: totalNotes });

    rebuildFuzzyIndex(indexDb);

    const folderCount = (sourceDb.prepare(`
      SELECT COUNT(*) as count FROM ZICCLOUDSYNCINGOBJECT WHERE Z_ENT = ? AND ZMARKEDFORDELETION = 0
    `).get(ENTITY_FOLDER) as { count: number }).count;

    const dateRange = indexDb.prepare(`
      SELECT MIN(modified_at) as oldest, MAX(modified_at) as newest FROM notes WHERE modified_at > 0
    `).get() as { oldest: number | null; newest: number | null };

    const stats: ExtendedStats = {
      totalNotes,
      totalFolders: folderCount,
      indexedAt: new Date().toISOString(),
      oldestNote: dateRange.oldest ? new Date(dateRange.oldest * 1000).toISOString() : null,
      newestNote: dateRange.newest ? new Date(dateRange.newest * 1000).toISOString() : null,
      lastIndexedModTime: maxModTime,
    };

    writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2));

    onProgress?.({ phase: 'done', current: totalNotes, total: totalNotes });

    return stats;
  } finally {
    sourceDb.close();
    indexDb.close();
  }
}

export async function ensureIndex(): Promise<void> {
  if (!existsSync(INDEX_DB_PATH) || !existsSync(FUZZY_INDEX_PATH)) {
    // No index exists, do full build
    await buildIndex();
  } else if (indexNeedsRebuild()) {
    // Index exists but outdated, do incremental update
    await updateIndex();
  }
}

export function getStats(): IndexStats | null {
  try {
    if (!existsSync(STATS_PATH)) {
      return null;
    }
    return JSON.parse(readFileSync(STATS_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

export function getIndexDbPath(): string {
  return INDEX_DB_PATH;
}

export function getFuzzyIndexPath(): string {
  return FUZZY_INDEX_PATH;
}
