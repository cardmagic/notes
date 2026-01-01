#!/usr/bin/env node

const args = process.argv.slice(2);

if (args.includes('--mcp')) {
  // Run as MCP server
  import('./mcp.js').then(({ runMcpServer }) => {
    runMcpServer().catch(console.error);
  });
} else {
  // Run as CLI
  import('./cli.js').then(({ runCli }) => {
    runCli();
  });
}
