import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { setupSearchTool } from "./tools/search_kb.js";
import { setupFigmaTool } from "./tools/figma.js";
import { setupJiraTool } from "./tools/jira.js";
import { setupConfluenceTool } from "./tools/confluence.js";

// Initialize the DON Workspace MCP Server
const server = new McpServer({
  name: "DON-Workspace-MCP",
  version: "1.0.0",
});

// 1. Setup specialized tools
// Core RAG capability referencing the local SQLite background synced DB
setupSearchTool(server);

// Setup External REST Hub connectors
setupFigmaTool(server);
setupJiraTool(server);
setupConfluenceTool(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DON Workspace MCP Server initialized via stdio transport.");
}

main().catch((error) => {
  console.error("Server initialization error:", error);
  process.exit(1);
});
