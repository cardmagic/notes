// Apple uses a different epoch: January 1, 2001
// Unix epoch is January 1, 1970
// Difference is 978307200 seconds
const APPLE_EPOCH_OFFSET = 978307200;

export function appleToUnix(appleTimestamp: number): number {
  return Math.floor(appleTimestamp) + APPLE_EPOCH_OFFSET;
}

export function appleToDate(appleTimestamp: number): Date {
  return new Date(appleToUnix(appleTimestamp) * 1000);
}

export function unixToApple(unixTimestamp: number): number {
  return unixTimestamp - APPLE_EPOCH_OFFSET;
}

export interface RawNote {
  rowid: number;
  title: string | null;
  snippet: string | null;
  folderId: number | null;
  folderName: string | null;
  creationDate: number | null;
  modificationDate: number | null;
  isPinned: number;
  isPasswordProtected: number;
  data: Buffer | null;
}

export interface IndexedNote {
  id: number;
  title: string;
  snippet: string;
  body: string;
  folder: string;
  createdAt: number; // Unix timestamp
  modifiedAt: number; // Unix timestamp
  isPinned: boolean;
  isLocked: boolean;
}

export interface SearchResult extends IndexedNote {
  score: number;
  matchedTerms: string[];
}

export interface FolderInfo {
  id: number;
  name: string;
  noteCount: number;
  lastModified: number;
}

export interface IndexStats {
  totalNotes: number;
  totalFolders: number;
  indexedAt: string;
  oldestNote: string | null;
  newestNote: string | null;
}
