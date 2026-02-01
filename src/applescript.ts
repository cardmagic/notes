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

function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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
    const result = execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf-8',
      timeout: 30000,
    });

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

  let script: string;

  if (folder) {
    const escapedFolder = escapeAppleScript(folder);
    script = `
      tell application "Notes"
        set targetFolder to folder "${escapedFolder}"
        set matchingNotes to notes of targetFolder whose name is "${escapedTitle}"
        if (count of matchingNotes) is 0 then
          error "Note not found"
        end if
        delete item 1 of matchingNotes
        return "${escapedTitle}"
      end tell
    `;
  } else {
    script = `
      tell application "Notes"
        set matchingNotes to notes whose name is "${escapedTitle}"
        if (count of matchingNotes) is 0 then
          error "Note not found"
        end if
        delete item 1 of matchingNotes
        return "${escapedTitle}"
      end tell
    `;
  }

  try {
    const result = execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf-8',
      timeout: 30000,
    });

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

  const escapedTitle = escapeAppleScript(title);
  const escapedBody = escapeAppleScript(body);

  let script: string;
  const targetFolder = folder || 'Notes';

  if (folder) {
    const escapedFolder = escapeAppleScript(folder);
    script = `
      tell application "Notes"
        set targetFolder to folder "${escapedFolder}"
        set matchingNotes to notes of targetFolder whose name is "${escapedTitle}"
        if (count of matchingNotes) is 0 then
          error "Note not found"
        end if
        set targetNote to item 1 of matchingNotes
        set body of targetNote to "${escapedBody}"
        return name of targetNote
      end tell
    `;
  } else {
    script = `
      tell application "Notes"
        set matchingNotes to notes whose name is "${escapedTitle}"
        if (count of matchingNotes) is 0 then
          error "Note not found"
        end if
        set targetNote to item 1 of matchingNotes
        set body of targetNote to "${escapedBody}"
        return name of targetNote
      end tell
    `;
  }

  try {
    const result = execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf-8',
      timeout: 30000,
    });

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
    const result = execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf-8',
      timeout: 30000,
    });

    return result.trim().split('\n').filter(Boolean);
  } catch (error) {
    throw new Error(`Failed to list folders: ${(error as Error).message}`);
  }
}
