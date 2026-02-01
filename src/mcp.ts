import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  searchNotes,
  getRecentNotes,
  getNoteById,
  getNotesInFolder,
  listFolders,
  getNoteStats,
} from './searcher.js';
import { createNote, deleteNote, editNote } from './applescript.js';
import type { IndexedNote, SearchResult } from './types.js';

function formatNoteForMcp(note: IndexedNote): string {
  const lines: string[] = [];

  const pinned = note.isPinned ? '📌 ' : '';
  const locked = note.isLocked ? ' 🔒' : '';
  lines.push(`${pinned}${note.title || 'Untitled'}${locked}`);
  lines.push(`📁 ${note.folder}`);

  if (note.snippet) {
    lines.push(`Snippet: ${note.snippet}`);
  }

  lines.push(`Modified: ${new Date(note.modifiedAt * 1000).toISOString()}`);
  lines.push(`ID: ${note.id}`);

  return lines.join('\n');
}

function formatSearchResultForMcp(result: SearchResult): string {
  const lines: string[] = [];

  const pinned = result.isPinned ? '📌 ' : '';
  const locked = result.isLocked ? ' 🔒' : '';
  lines.push(`${pinned}${result.title || 'Untitled'}${locked}`);
  lines.push(`📁 ${result.folder}`);

  if (result.snippet) {
    lines.push(`Snippet: ${result.snippet}`);
  }

  lines.push(`Score: ${result.score.toFixed(2)}`);
  lines.push(`Matched: ${result.matchedTerms.join(', ')}`);
  lines.push(`Modified: ${new Date(result.modifiedAt * 1000).toISOString()}`);
  lines.push(`ID: ${result.id}`);

  return lines.join('\n');
}

export async function runMcpServer(): Promise<void> {
  const server = new Server(
    {
      name: 'notes',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'search_notes',
        description: 'Search through Apple Notes with fuzzy matching. Searches note titles, snippets, and body text.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query - supports fuzzy matching and typos',
            },
            folder: {
              type: 'string',
              description: 'Optional folder name to filter results',
            },
            after: {
              type: 'string',
              description: 'Optional date filter (YYYY-MM-DD) - only notes modified after this date',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 20)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'recent_notes',
        description: 'Get the most recently modified Apple Notes',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of notes to return (default: 20)',
            },
          },
        },
      },
      {
        name: 'read_note',
        description: 'Read the full content of a specific note by its ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'The note ID to read',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'list_folders',
        description: 'List all Apple Notes folders with note counts',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of folders to return (default: 50)',
            },
          },
        },
      },
      {
        name: 'notes_in_folder',
        description: 'List notes in a specific folder',
        inputSchema: {
          type: 'object',
          properties: {
            folder: {
              type: 'string',
              description: 'Folder name to list notes from',
            },
            after: {
              type: 'string',
              description: 'Optional date filter (YYYY-MM-DD)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of notes to return (default: 50)',
            },
          },
          required: ['folder'],
        },
      },
      {
        name: 'get_note_stats',
        description: 'Get statistics about the Apple Notes index',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'create_note',
        description: 'Create a new note in Apple Notes',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Title of the note',
            },
            body: {
              type: 'string',
              description: 'Body content of the note',
            },
            folder: {
              type: 'string',
              description: 'Folder to create the note in (default: "Notes")',
            },
          },
          required: ['title', 'body'],
        },
      },
      {
        name: 'delete_note',
        description: 'Delete a note from Apple Notes by its title',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Title of the note to delete',
            },
            folder: {
              type: 'string',
              description: 'Optional folder containing the note (helps find the correct note if multiple notes have the same title)',
            },
          },
          required: ['title'],
        },
      },
      {
        name: 'edit_note',
        description: 'Edit an existing note in Apple Notes (preserves created timestamp)',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'Note ID to edit (from search/recent results)',
            },
            title: {
              type: 'string',
              description: 'Edit by title instead of ID',
            },
            body: {
              type: 'string',
              description: 'New body content for the note',
            },
            folder: {
              type: 'string',
              description: 'Folder containing the note (for disambiguation when editing by title)',
            },
          },
          required: ['body'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'search_notes': {
          const query = args?.query as string;
          const folder = args?.folder as string | undefined;
          const after = args?.after as string | undefined;
          const limit = (args?.limit as number) || 20;

          const results = await searchNotes(query, { limit, folder, after });

          if (results.length === 0) {
            return {
              content: [{ type: 'text', text: `No results found for "${query}"` }],
            };
          }

          const formatted = results.map(formatSearchResultForMcp).join('\n\n---\n\n');
          return {
            content: [{ type: 'text', text: `Found ${results.length} notes:\n\n${formatted}` }],
          };
        }

        case 'recent_notes': {
          const limit = (args?.limit as number) || 20;
          const notes = await getRecentNotes(limit);

          if (notes.length === 0) {
            return {
              content: [{ type: 'text', text: 'No notes found.' }],
            };
          }

          const formatted = notes.map(formatNoteForMcp).join('\n\n---\n\n');
          return {
            content: [{ type: 'text', text: `${notes.length} recent notes:\n\n${formatted}` }],
          };
        }

        case 'read_note': {
          const id = args?.id as number;
          const note = await getNoteById(id);

          if (!note) {
            return {
              content: [{ type: 'text', text: `Note with ID ${id} not found.` }],
            };
          }

          const lines: string[] = [];
          const pinned = note.isPinned ? '📌 ' : '';
          const locked = note.isLocked ? ' 🔒' : '';

          lines.push(`# ${pinned}${note.title || 'Untitled'}${locked}`);
          lines.push('');
          lines.push(`**Folder:** ${note.folder}`);
          lines.push(`**Created:** ${new Date(note.createdAt * 1000).toISOString()}`);
          lines.push(`**Modified:** ${new Date(note.modifiedAt * 1000).toISOString()}`);

          if (note.snippet) {
            lines.push('');
            lines.push(`**Snippet:** ${note.snippet}`);
          }

          if (note.body) {
            lines.push('');
            lines.push('## Content');
            lines.push('');
            lines.push(note.body);
          }

          return {
            content: [{ type: 'text', text: lines.join('\n') }],
          };
        }

        case 'list_folders': {
          const limit = (args?.limit as number) || 50;
          const folders = await listFolders(limit);

          if (folders.length === 0) {
            return {
              content: [{ type: 'text', text: 'No folders found.' }],
            };
          }

          const lines = folders.map(f =>
            `📁 ${f.name} (${f.noteCount} notes, last modified: ${new Date(f.lastModified * 1000).toISOString()})`
          );

          return {
            content: [{ type: 'text', text: `${folders.length} folders:\n\n${lines.join('\n')}` }],
          };
        }

        case 'notes_in_folder': {
          const folder = args?.folder as string;
          const after = args?.after as string | undefined;
          const limit = (args?.limit as number) || 50;

          const notes = await getNotesInFolder(folder, { limit, after });

          if (notes.length === 0) {
            return {
              content: [{ type: 'text', text: `No notes found in folder "${folder}".` }],
            };
          }

          const formatted = notes.map(formatNoteForMcp).join('\n\n---\n\n');
          return {
            content: [{ type: 'text', text: `${notes.length} notes in "${folder}":\n\n${formatted}` }],
          };
        }

        case 'get_note_stats': {
          const stats = await getNoteStats();

          if (!stats) {
            return {
              content: [{ type: 'text', text: 'No index found. The index will be built on first search.' }],
            };
          }

          const lines = [
            '📊 Apple Notes Index Statistics',
            '',
            `Total Notes: ${stats.totalNotes}`,
            `Total Folders: ${stats.totalFolders}`,
            `Indexed At: ${stats.indexedAt}`,
          ];

          if (stats.oldestNote) {
            lines.push(`Oldest Note: ${stats.oldestNote}`);
          }
          if (stats.newestNote) {
            lines.push(`Newest Note: ${stats.newestNote}`);
          }

          return {
            content: [{ type: 'text', text: lines.join('\n') }],
          };
        }

        case 'create_note': {
          const title = args?.title as string;
          const body = args?.body as string;
          const folder = args?.folder as string | undefined;

          const result = createNote({ title, body, folder });

          return {
            content: [{ type: 'text', text: `✅ Created note "${result.name}" in folder "${result.folder}"` }],
          };
        }

        case 'delete_note': {
          const title = args?.title as string;
          const folder = args?.folder as string | undefined;

          const result = deleteNote(title, folder);

          return {
            content: [{ type: 'text', text: `✅ Deleted note "${result.name}"` }],
          };
        }

        case 'edit_note': {
          const id = args?.id as number | undefined;
          const titleArg = args?.title as string | undefined;
          const body = args?.body as string;
          let folder = args?.folder as string | undefined;

          let title: string;

          if (id !== undefined) {
            const note = await getNoteById(id);
            if (!note) {
              return {
                content: [{ type: 'text', text: `Note with ID ${id} not found.` }],
                isError: true,
              };
            }
            title = note.title;
            folder = folder || note.folder;
          } else if (titleArg) {
            title = titleArg;
          } else {
            return {
              content: [{ type: 'text', text: 'Either id or title is required.' }],
              isError: true,
            };
          }

          const result = editNote({ title, body, folder });

          return {
            content: [{ type: 'text', text: `✅ Updated note "${result.name}" in folder "${result.folder}"` }],
          };
        }

        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
