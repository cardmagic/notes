import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const PAPER_CACHE_DIR = join(
  homedir(),
  'Library/Group Containers/group.com.apple.notes/Library/Caches/Paper'
);

const NOTES_DB_PATH = join(
  homedir(),
  'Library/Group Containers/group.com.apple.notes/NoteStore.sqlite'
);

interface AttachmentRow {
  attachmentId: number;
  noteId: number;
  noteTitle: string;
  attachmentName: string;
  contentIdentifier: string;
  typeUti: string;
}

/**
 * Get PDF attachments from the Notes database
 */
function getPdfAttachmentsFromDb(): AttachmentRow[] {
  try {
    const db = new Database(NOTES_DB_PATH, { readonly: true });

    const query = db.prepare(`
      SELECT
        a.Z_PK as attachmentId,
        a.ZNOTE as noteId,
        n.ZTITLE1 as noteTitle,
        a.ZFILENAME as attachmentName,
        a.ZIDENTIFIER as contentIdentifier,
        a.ZTYPEUTI as typeUti
      FROM ZICCLOUDSYNCINGOBJECT a
      JOIN ZICCLOUDSYNCINGOBJECT n ON a.ZNOTE = n.Z_PK
      WHERE a.Z_ENT = 5
        AND (a.ZTYPEUTI = 'com.adobe.pdf' OR a.ZTYPEUTI = 'com.apple.paper.doc.pdf')
        AND a.ZIDENTIFIER IS NOT NULL
    `);

    const rows = query.all() as AttachmentRow[];
    db.close();
    return rows;
  } catch {
    return [];
  }
}

/**
 * Find the cached file for a given UUID in the Paper cache
 */
function findCachedFile(uuid: string): string | null {
  const bundlePath = join(PAPER_CACHE_DIR, `${uuid}.bundle`, 'Assets.bundle');

  if (!existsSync(bundlePath)) {
    return null;
  }

  try {
    const files = readdirSync(bundlePath);
    for (const file of files) {
      const filePath = join(bundlePath, file);
      // Check if it's a PDF
      try {
        const result = execSync(`file "${filePath}"`, { encoding: 'utf-8', timeout: 5000 });
        if (result.includes('PDF')) {
          return filePath;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Extract text from a PDF file using pdftotext
 */
function extractPdfText(pdfPath: string): string {
  try {
    const text = execSync(`pdftotext "${pdfPath}" - 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return text.trim();
  } catch {
    return '';
  }
}

/**
 * Get text from all PDF attachments in Notes
 * Returns a map of noteId (database ID) -> extracted PDF text
 */
export function extractAllPdfText(): Map<string, string> {
  const pdfTextByNote = new Map<string, string>();

  // Check if pdftotext is available
  try {
    execSync('which pdftotext', { encoding: 'utf-8' });
  } catch {
    // pdftotext not installed, skip PDF extraction
    return pdfTextByNote;
  }

  const attachments = getPdfAttachmentsFromDb();

  for (const att of attachments) {
    if (!att.contentIdentifier) continue;

    const cachedPath = findCachedFile(att.contentIdentifier);
    if (cachedPath) {
      const text = extractPdfText(cachedPath);
      if (text) {
        const noteKey = `note_${att.noteId}`;
        const attachmentLabel = att.attachmentName || 'PDF Attachment';

        // Append to existing text for this note (note may have multiple PDFs)
        const existing = pdfTextByNote.get(noteKey) || '';
        const combined = existing
          ? `${existing}\n\n--- ${attachmentLabel} ---\n\n${text}`
          : `--- ${attachmentLabel} ---\n\n${text}`;
        pdfTextByNote.set(noteKey, combined);
      }
    }
  }

  return pdfTextByNote;
}

/**
 * Get the note key format used in extractAllPdfText
 */
export function getNoteKey(noteDbId: number): string {
  return `note_${noteDbId}`;
}
