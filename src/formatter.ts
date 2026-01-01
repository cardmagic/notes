import chalk from 'chalk';
import type { IndexedNote, SearchResult, FolderInfo, IndexStats } from './types.js';
import type { IndexProgress } from './indexer.js';

export function formatDate(unixTimestamp: number): string {
  if (!unixTimestamp || unixTimestamp <= 0) {
    return 'Unknown';
  }
  return new Date(unixTimestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatNote(note: IndexedNote, showBody = false): string {
  const lines: string[] = [];

  // Title with pin indicator
  const titlePrefix = note.isPinned ? chalk.yellow('📌 ') : '';
  const lockSuffix = note.isLocked ? chalk.red(' 🔒') : '';
  lines.push(titlePrefix + chalk.bold.cyan(note.title || 'Untitled') + lockSuffix);

  // Folder
  lines.push(chalk.dim(`📁 ${note.folder}`));

  // Snippet
  if (note.snippet) {
    lines.push(chalk.gray(note.snippet));
  }

  // Body preview if requested
  if (showBody && note.body) {
    const bodyPreview = note.body.slice(0, 200).replace(/\n/g, ' ');
    lines.push(chalk.dim(bodyPreview + (note.body.length > 200 ? '...' : '')));
  }

  // Modified date
  lines.push(chalk.dim(`Modified: ${formatDate(note.modifiedAt)}`));

  return lines.join('\n');
}

export function formatSearchResult(
  result: SearchResult,
  query: string
): string {
  const lines: string[] = [];

  // Match indicator and title
  const titlePrefix = result.isPinned ? chalk.yellow('📌 ') : '';
  const lockSuffix = result.isLocked ? chalk.red(' 🔒') : '';
  const highlightedTitle = highlightMatches(result.title || 'Untitled', query);
  lines.push(chalk.green('▶ ') + titlePrefix + chalk.bold.cyan(highlightedTitle) + lockSuffix);

  // Folder
  lines.push(chalk.dim(`  📁 ${result.folder}`));

  // Highlighted snippet
  if (result.snippet) {
    const highlightedSnippet = highlightMatches(result.snippet, query);
    lines.push(`  ${highlightedSnippet}`);
  }

  // Score and matched terms
  lines.push(
    chalk.dim(`  Score: ${result.score.toFixed(2)} | Terms: ${result.matchedTerms.join(', ')}`)
  );

  // Modified date
  lines.push(chalk.dim(`  Modified: ${formatDate(result.modifiedAt)}`));

  return lines.join('\n');
}

function highlightMatches(text: string, query: string): string {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

  let highlighted = text;
  for (const term of terms) {
    const regex = new RegExp(`(${escapeRegex(term)})`, 'gi');
    highlighted = highlighted.replace(regex, chalk.bgYellow.black('$1'));
  }

  return highlighted;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function formatFolder(folder: FolderInfo): string {
  const lines: string[] = [];

  lines.push(chalk.bold.magenta(`📁 ${folder.name}`));
  lines.push(chalk.dim(`   ${folder.noteCount} notes | Last modified: ${formatDate(folder.lastModified)}`));

  return lines.join('\n');
}

export function formatStats(stats: IndexStats): string {
  const lines: string[] = [];

  lines.push(chalk.bold.cyan('📊 Notes Index Statistics'));
  lines.push('');
  lines.push(`  Total Notes:   ${chalk.bold(stats.totalNotes.toString())}`);
  lines.push(`  Total Folders: ${chalk.bold(stats.totalFolders.toString())}`);
  lines.push(`  Indexed At:    ${chalk.dim(stats.indexedAt)}`);

  if (stats.oldestNote) {
    lines.push(`  Oldest Note:   ${chalk.dim(stats.oldestNote)}`);
  }
  if (stats.newestNote) {
    lines.push(`  Newest Note:   ${chalk.dim(stats.newestNote)}`);
  }

  return lines.join('\n');
}

export function formatIndexProgress(progress: IndexProgress): string {
  const { phase, current, total } = progress;
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  const barWidth = 30;
  const filledWidth = Math.round((percent / 100) * barWidth);
  const bar = '█'.repeat(filledWidth) + '░'.repeat(barWidth - filledWidth);

  let phaseText: string;
  switch (phase) {
    case 'extracting-pdfs':
      phaseText = chalk.magenta('Extracting PDFs...');
      break;
    case 'reading':
      phaseText = chalk.yellow('Reading notes...');
      break;
    case 'indexing':
      phaseText = chalk.blue('Building index...');
      break;
    case 'done':
      phaseText = chalk.green('Done!');
      break;
  }

  return `${phaseText}\n[${chalk.cyan(bar)}] ${percent}% (${current}/${total})`;
}

export function formatNoteList(notes: IndexedNote[]): string {
  if (notes.length === 0) {
    return chalk.dim('No notes found.');
  }

  return notes.map(note => formatNote(note)).join('\n\n');
}

export function formatSearchResults(results: SearchResult[], query: string): string {
  if (results.length === 0) {
    return chalk.dim(`No results found for "${query}".`);
  }

  return results.map(result => formatSearchResult(result, query)).join('\n\n');
}

export function formatFolderList(folders: FolderInfo[]): string {
  if (folders.length === 0) {
    return chalk.dim('No folders found.');
  }

  return folders.map(folder => formatFolder(folder)).join('\n\n');
}
