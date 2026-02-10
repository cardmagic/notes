import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
import { buildIndex, updateIndex, indexNeedsRebuild } from './indexer.js';
import {
  searchNotes,
  getRecentNotes,
  getNoteById,
  getNotesInFolder,
  listFolders,
  getNoteStats,
  closeConnections,
} from './searcher.js';
import {
  formatSearchResults,
  formatNoteList,
  formatFolderList,
  formatStats,
  formatIndexProgress,
  formatNote,
} from './formatter.js';
import { createNote, deleteNote, editNote } from './applescript.js';

const program = new Command();

program
  .name('notes')
  .description('CLI tool to search and browse Apple Notes')
  .version(pkg.version);

program
  .command('search <query>')
  .description('Search notes with fuzzy matching')
  .option('-l, --limit <number>', 'Maximum results to return', '20')
  .option('-f, --folder <name>', 'Filter by folder name')
  .option('-a, --after <date>', 'Only notes modified after this date (YYYY-MM-DD)')
  .action(async (query: string, options: { limit: string; folder?: string; after?: string }) => {
    try {
      const results = await searchNotes(query, {
        limit: parseInt(options.limit, 10),
        folder: options.folder,
        after: options.after,
      });
      console.log(formatSearchResults(results, query));
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    } finally {
      closeConnections();
    }
  });

program
  .command('recent')
  .description('Show most recent notes')
  .option('-l, --limit <number>', 'Maximum notes to return', '20')
  .action(async (options: { limit: string }) => {
    try {
      const notes = await getRecentNotes(parseInt(options.limit, 10));
      console.log(formatNoteList(notes));
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    } finally {
      closeConnections();
    }
  });

program
  .command('read <id>')
  .description('Read a note by ID')
  .action(async (id: string) => {
    try {
      const noteId = parseInt(id, 10);
      if (isNaN(noteId)) {
        console.error('Invalid note ID');
        process.exit(1);
      }

      const note = await getNoteById(noteId);
      if (!note) {
        console.error('Note not found');
        process.exit(1);
      }

      console.log(formatNote(note, true));
      if (note.body) {
        console.log('\n--- Content ---\n');
        console.log(note.body);
      }
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    } finally {
      closeConnections();
    }
  });

program
  .command('folder <name>')
  .description('List notes in a folder')
  .option('-l, --limit <number>', 'Maximum notes to return', '50')
  .option('-a, --after <date>', 'Only notes modified after this date (YYYY-MM-DD)')
  .action(async (name: string, options: { limit: string; after?: string }) => {
    try {
      const notes = await getNotesInFolder(name, {
        limit: parseInt(options.limit, 10),
        after: options.after,
      });
      console.log(formatNoteList(notes));
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    } finally {
      closeConnections();
    }
  });

program
  .command('folders')
  .description('List all folders')
  .option('-l, --limit <number>', 'Maximum folders to return', '50')
  .action(async (options: { limit: string }) => {
    try {
      const folders = await listFolders(parseInt(options.limit, 10));
      console.log(formatFolderList(folders));
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    } finally {
      closeConnections();
    }
  });

program
  .command('index')
  .description('Update or rebuild the search index')
  .option('-f, --force', 'Force full rebuild (default is incremental update)')
  .action(async (options: { force?: boolean }) => {
    try {
      if (options.force) {
        console.log('Rebuilding entire index...\n');
        const stats = await buildIndex(progress => {
          const msg = progress.message ? ` ${progress.message}` : '';
          process.stdout.write('\r' + formatIndexProgress(progress).split('\n').join(' | ') + msg);
        });
        console.log('\n\n');
        console.log(formatStats(stats));
      } else {
        if (!indexNeedsRebuild()) {
          console.log('Index is up to date.');
          return;
        }

        console.log('Updating index...\n');
        const result = await updateIndex(progress => {
          const msg = progress.message ? ` ${progress.message}` : '';
          process.stdout.write('\r' + formatIndexProgress(progress).split('\n').join(' | ') + msg);
        });

        console.log('\n\n');
        console.log(`Updated ${result.updated} notes, removed ${result.deleted} deleted notes.`);
        console.log(formatStats(result));
      }
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('stats')
  .description('Show index statistics')
  .action(async () => {
    try {
      const stats = await getNoteStats();
      if (!stats) {
        console.log('No index found. Run "notes index" first.');
        return;
      }
      console.log(formatStats(stats));
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    } finally {
      closeConnections();
    }
  });

program
  .command('create <title>')
  .description('Create a new note')
  .option('-f, --folder <name>', 'Folder to create note in', 'Notes')
  .option('-b, --body <text>', 'Note body content', '')
  .action(async (title: string, options: { folder: string; body: string }) => {
    try {
      const result = createNote({
        title,
        body: options.body,
        folder: options.folder,
      });
      console.log(`Created note "${result.name}" in folder "${result.folder}"`);
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('delete <title>')
  .description('Delete a note by title')
  .option('-f, --folder <name>', 'Folder containing the note')
  .action(async (title: string, options: { folder?: string }) => {
    try {
      const result = deleteNote(title, options.folder);
      console.log(`Deleted note "${result.name}"`);
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('edit [id]')
  .description('Edit an existing note by ID or title (ID takes precedence if both provided)')
  .option('-t, --title <name>', 'Edit by title instead of ID')
  .option('-b, --body <text>', 'New body content')
  .option('-f, --folder <name>', 'Folder containing the note (for disambiguation)')
  .action(async (id: string | undefined, options: { title?: string; body?: string; folder?: string }) => {
    try {
      if (!options.body) {
        console.error('Error: --body is required');
        process.exit(1);
      }

      if (!id && !options.title) {
        console.error('Error: Either <id> or --title is required');
        process.exit(1);
      }

      let title: string;
      let folder: string | undefined = options.folder;

      // ID takes precedence if both are provided
      if (id) {
        const noteId = parseInt(id, 10);
        if (isNaN(noteId)) {
          console.error('Invalid note ID');
          process.exit(1);
        }

        const note = await getNoteById(noteId);
        if (!note) {
          console.error('Note not found');
          process.exit(1);
        }

        title = note.title;
        folder = folder || note.folder;
      } else {
        title = options.title!;
      }

      const result = editNote({
        title,
        body: options.body,
        folder,
      });
      console.log(`Updated note "${result.name}" in folder "${result.folder}"`);
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    } finally {
      closeConnections();
    }
  });

export function runCli(): void {
  program.parse(process.argv);
}
