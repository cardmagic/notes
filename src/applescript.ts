import { execSync } from 'node:child_process';

export interface CreateNoteOptions {
  title: string;
  body: string;
  folder?: string;
}

export interface CreateNoteResult {
  success: boolean;
  name: string;
  folder: string;
}

export interface DeleteNoteResult {
  success: boolean;
  name: string;
}

export interface EditNoteOptions {
  title: string;
  body: string;
  folder?: string;
}

export interface EditNoteResult {
  success: boolean;
  name: string;
  folder: string;
}

/**
 * Escapes a string for safe use in AppleScript string literals.
 * Handles backslashes, quotes, newlines, and control characters.
 */
function escapeAppleScript(str: string): string {
  return str
    .replace(/\\/g, '\\\\')           // Backslash must be first
    .replace(/"/g, '\\"')             // Double quotes
    .replace(/\n/g, '\\n')            // Newlines
    .replace(/\r/g, '\\r')            // Carriage returns
    .replace(/\t/g, '\\t')            // Tabs
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, ''); // Strip other control chars
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Executes an AppleScript by passing it via stdin to avoid shell injection.
 * This is more secure than using -e flag with shell escaping.
 *
 * @param script - The complete AppleScript to execute
 * @returns The output from the script
 * @throws Error if execution fails
 */
function executeAppleScript(script: string): string {
  return execSync('osascript -', {
    input: script,
    encoding: 'utf-8',
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024, // 10MB for large note bodies
  });
}

/**
 * Builds an AppleScript that finds a note by title and performs an operation on it.
 * Handles folder scoping when provided.
 *
 * @param title - The note title to search for
 * @param operation - AppleScript code to execute on the found note. The note is available
 *                    as the `targetNote` variable. Should include a `return` statement.
 *                    Example: `delete targetNote\nreturn "deleted"`
 * @param folder - Optional folder name to scope the search
 */
function buildNoteOperationScript(
  title: string,
  operation: string,
  folder?: string
): string {
  const escapedTitle = escapeAppleScript(title);

  if (folder) {
    const escapedFolder = escapeAppleScript(folder);
    return `
      tell application "Notes"
        set targetFolder to folder "${escapedFolder}"
        set matchingNotes to notes of targetFolder whose name is "${escapedTitle}"
        if (count of matchingNotes) is 0 then
          error "Note not found"
        end if
        set targetNote to item 1 of matchingNotes
        ${operation}
      end tell
    `;
  } else {
    return `
      tell application "Notes"
        set matchingNotes to notes whose name is "${escapedTitle}"
        if (count of matchingNotes) is 0 then
          error "Note not found"
        end if
        set targetNote to item 1 of matchingNotes
        ${operation}
      end tell
    `;
  }
}

export function createNote(options: CreateNoteOptions): CreateNoteResult {
  const { title, body, folder = 'Notes' } = options;

  const escapedTitle = escapeAppleScript(title);
  const escapedBody = escapeAppleScript(body);
  const escapedFolder = escapeAppleScript(folder);

  const script = `
    tell application "Notes"
      set targetFolder to folder "${escapedFolder}"
      set newNote to make new note at targetFolder with properties {name:"${escapedTitle}", body:"${escapedBody}"}
      return name of newNote
    end tell
  `;

  try {
    const result = executeAppleScript(script);

    return {
      success: true,
      name: result.trim(),
      folder,
    };
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('get folder')) {
      throw new Error(`Folder "${folder}" not found. Use 'notes folders' to list available folders.`);
    }
    throw new Error(`Failed to create note: ${message}`);
  }
}

export function deleteNote(title: string, folder?: string): DeleteNoteResult {
  const escapedTitle = escapeAppleScript(title);
  const operation = `
    delete targetNote
    return "${escapedTitle}"
  `;

  const script = buildNoteOperationScript(title, operation, folder);

  try {
    const result = executeAppleScript(script);

    return {
      success: true,
      name: result.trim(),
    };
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('Note not found')) {
      const folderInfo = folder ? ` in folder "${folder}"` : '';
      throw new Error(`Note "${title}" not found${folderInfo}.`);
    }
    if (message.includes('get folder')) {
      throw new Error(`Folder "${folder}" not found. Use 'notes folders' to list available folders.`);
    }
    throw new Error(`Failed to delete note: ${message}`);
  }
}

export function editNote(options: EditNoteOptions): EditNoteResult {
  const { title, body, folder } = options;

  // Apple Notes uses the first line of the body as the title, so we prepend the title
  // as an HTML heading to preserve it when setting the body
  const fullBody = `<h1>${escapeHtml(title)}</h1><br>${escapeHtml(body)}`;
  const escapedBody = escapeAppleScript(fullBody);
  const targetFolder = folder || 'Notes';

  const operation = `
    set body of targetNote to "${escapedBody}"
    return name of targetNote
  `;

  const script = buildNoteOperationScript(title, operation, folder);

  try {
    const result = executeAppleScript(script);

    return {
      success: true,
      name: result.trim(),
      folder: targetFolder,
    };
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('Note not found')) {
      const folderInfo = folder ? ` in folder "${folder}"` : '';
      throw new Error(`Note "${title}" not found${folderInfo}.`);
    }
    if (message.includes('get folder')) {
      throw new Error(`Folder "${folder}" not found. Use 'notes folders' to list available folders.`);
    }
    throw new Error(`Failed to edit note: ${message}`);
  }
}

export function listNoteFolders(): string[] {
  const script = `
    tell application "Notes"
      set folderNames to name of every folder
      set output to ""
      repeat with folderName in folderNames
        set output to output & folderName & linefeed
      end repeat
      return output
    end tell
  `;

  try {
    const result = executeAppleScript(script);

    return result.trim().split('\n').filter(Boolean);
  } catch (error) {
    throw new Error(`Failed to list folders: ${(error as Error).message}`);
  }
}
