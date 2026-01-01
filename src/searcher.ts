import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'node:fs';
import MiniSearch from 'minisearch';
import type { IndexedNote, SearchResult, FolderInfo, IndexStats } from './types.js';
import { ensureIndex, getIndexDbPath, getFuzzyIndexPath, getStats } from './indexer.js';

let cachedDb: Database.Database | null = null;
let cachedMiniSearch: MiniSearch<IndexedNote> | null = null;

function getDb(): Database.Database {
  if (cachedDb) {
    return cachedDb;
  }

  const dbPath = getIndexDbPath();
  if (!existsSync(dbPath)) {
    throw new Error('Index not found. Run "notes index" first.');
  }

  cachedDb = new Database(dbPath, { readonly: true });
  return cachedDb;
}

function getMiniSearch(): MiniSearch<IndexedNote> {
  if (cachedMiniSearch) {
    return cachedMiniSearch;
  }

  const indexPath = getFuzzyIndexPath();
  if (!existsSync(indexPath)) {
    throw new Error('Fuzzy index not found. Run "notes index" first.');
  }

  const data = JSON.parse(readFileSync(indexPath, 'utf-8'));
  cachedMiniSearch = MiniSearch.loadJS(data, {
    fields: ['title', 'snippet', 'body', 'folder'],
    storeFields: ['id', 'title', 'snippet', 'folder', 'createdAt', 'modifiedAt', 'isPinned', 'isLocked'],
    searchOptions: {
      fuzzy: 0.2,
      prefix: true,
      boost: { title: 3, snippet: 2, body: 1, folder: 1 },
    },
  });

  return cachedMiniSearch;
}

export function closeConnections(): void {
  if (cachedDb) {
    cachedDb.close();
    cachedDb = null;
  }
  cachedMiniSearch = null;
}

export interface SearchOptions {
  limit?: number;
  folder?: string;
  after?: string; // ISO date string
}

export async function searchNotes(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  await ensureIndex();

  const { limit = 20, folder, after } = options;
  const miniSearch = getMiniSearch();
  const db = getDb();

  // Use MiniSearch for fuzzy search
  const searchResults = miniSearch.search(query, { fuzzy: 0.2, prefix: true });

  if (searchResults.length === 0) {
    return [];
  }

  // Get full note data from SQLite
  const ids = searchResults.slice(0, limit * 2).map(r => r.id);
  const placeholders = ids.map(() => '?').join(',');

  let sql = `
    SELECT id, title, snippet, body, folder, created_at, modified_at, is_pinned, is_locked
    FROM notes
    WHERE id IN (${placeholders})
  `;
  const params: (string | number)[] = [...ids];

  if (folder) {
    sql += ' AND folder LIKE ?';
    params.push(`%${folder}%`);
  }

  if (after) {
    const afterDate = new Date(after);
    if (!isNaN(afterDate.getTime())) {
      sql += ' AND modified_at >= ?';
      params.push(Math.floor(afterDate.getTime() / 1000));
    }
  }

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params) as Array<{
    id: number;
    title: string;
    snippet: string;
    body: string;
    folder: string;
    created_at: number;
    modified_at: number;
    is_pinned: number;
    is_locked: number;
  }>;

  // Build results with scores
  const results: SearchResult[] = rows.map(row => {
    const searchResult = searchResults.find(sr => sr.id === row.id);
    return {
      id: row.id,
      title: row.title,
      snippet: row.snippet,
      body: row.body,
      folder: row.folder,
      createdAt: row.created_at,
      modifiedAt: row.modified_at,
      isPinned: row.is_pinned === 1,
      isLocked: row.is_locked === 1,
      score: searchResult?.score || 0,
      matchedTerms: searchResult?.terms || [],
    };
  });

  // Sort by score and limit
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function getRecentNotes(limit = 20): Promise<IndexedNote[]> {
  await ensureIndex();

  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, title, snippet, body, folder, created_at, modified_at, is_pinned, is_locked
    FROM notes
    ORDER BY modified_at DESC
    LIMIT ?
  `);

  const rows = stmt.all(limit) as Array<{
    id: number;
    title: string;
    snippet: string;
    body: string;
    folder: string;
    created_at: number;
    modified_at: number;
    is_pinned: number;
    is_locked: number;
  }>;

  return rows.map(row => ({
    id: row.id,
    title: row.title,
    snippet: row.snippet,
    body: row.body,
    folder: row.folder,
    createdAt: row.created_at,
    modifiedAt: row.modified_at,
    isPinned: row.is_pinned === 1,
    isLocked: row.is_locked === 1,
  }));
}

export async function getNoteById(id: number): Promise<IndexedNote | null> {
  await ensureIndex();

  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, title, snippet, body, folder, created_at, modified_at, is_pinned, is_locked
    FROM notes
    WHERE id = ?
  `);

  const row = stmt.get(id) as {
    id: number;
    title: string;
    snippet: string;
    body: string;
    folder: string;
    created_at: number;
    modified_at: number;
    is_pinned: number;
    is_locked: number;
  } | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    snippet: row.snippet,
    body: row.body,
    folder: row.folder,
    createdAt: row.created_at,
    modifiedAt: row.modified_at,
    isPinned: row.is_pinned === 1,
    isLocked: row.is_locked === 1,
  };
}

export async function getNotesInFolder(
  folderName: string,
  options: { limit?: number; after?: string } = {}
): Promise<IndexedNote[]> {
  await ensureIndex();

  const { limit = 50, after } = options;
  const db = getDb();

  let sql = `
    SELECT id, title, snippet, body, folder, created_at, modified_at, is_pinned, is_locked
    FROM notes
    WHERE folder LIKE ?
  `;
  const params: (string | number)[] = [`%${folderName}%`];

  if (after) {
    const afterDate = new Date(after);
    if (!isNaN(afterDate.getTime())) {
      sql += ' AND modified_at >= ?';
      params.push(Math.floor(afterDate.getTime() / 1000));
    }
  }

  sql += ' ORDER BY modified_at DESC LIMIT ?';
  params.push(limit);

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params) as Array<{
    id: number;
    title: string;
    snippet: string;
    body: string;
    folder: string;
    created_at: number;
    modified_at: number;
    is_pinned: number;
    is_locked: number;
  }>;

  return rows.map(row => ({
    id: row.id,
    title: row.title,
    snippet: row.snippet,
    body: row.body,
    folder: row.folder,
    createdAt: row.created_at,
    modifiedAt: row.modified_at,
    isPinned: row.is_pinned === 1,
    isLocked: row.is_locked === 1,
  }));
}

export async function listFolders(limit = 50): Promise<FolderInfo[]> {
  await ensureIndex();

  const db = getDb();
  const stmt = db.prepare(`
    SELECT
      folder as name,
      COUNT(*) as noteCount,
      MAX(modified_at) as lastModified
    FROM notes
    GROUP BY folder
    ORDER BY lastModified DESC
    LIMIT ?
  `);

  const rows = stmt.all(limit) as Array<{
    name: string;
    noteCount: number;
    lastModified: number;
  }>;

  return rows.map((row, index) => ({
    id: index + 1,
    name: row.name,
    noteCount: row.noteCount,
    lastModified: row.lastModified,
  }));
}

export async function getNoteStats(): Promise<IndexStats | null> {
  await ensureIndex();
  return getStats();
}
