import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Database from "better-sqlite3";
import path from "path";

// Initialize the SQLite connection to the synced remote-rag.db
// The DB is pulled locally by a background cron job to ensure offline-first querying.
const dbPath = process.env.DB_PATH || path.join(process.cwd(), "remote-rag.db");

// Lazy load DB so the server can boot globally even if DB is missing on fresh laptops
let db: Database.Database | null = null;

export function setupSearchTool(server: McpServer) {
  server.tool(
    "search_company_kb",
    "Search the local synced FTS5-BM25 knowledge base for company documents, rules, APIs, and Jira context. USE MULTIPLE SYNONYMS via FTS5 'OR' operators for best results.",
    {
      query_expansion_keywords: z
        .string()
        .describe("FTS5 query string using AND/OR operators. Example: 'authentication OR login OR sign-in OR oauth'"),
      project_id: z
        .string()
        .optional()
        .describe("Optional Project identifier to filter down document domains, e.g., 'AIA', 'SUZ', 'AAV'"),
    },
    async ({ query_expansion_keywords, project_id }) => {
      try {
        if (!db) {
          db = new Database(dbPath, { readonly: true });
        }

        // Example assuming an FTS5 configured table 'pages_fts'
        // Uses snippet() to drastically cut down on token usage for the LLM
        let sql = `
          SELECT 
            title, 
            snippet(pages_fts, -1, '[MATCH]', '[/MATCH]', '...', 64) as context,
            url
          FROM pages_fts 
          WHERE pages_fts MATCH ?
        `;

        const params: any[] = [query_expansion_keywords];

        // Theoretical hybrid search attachment if project metadata exists in the table
        /*
        if (project_id) {
          sql += ` AND project = ?`;
          params.push(project_id);
        }
        */

        sql += ` ORDER BY bm25(pages_fts) LIMIT 5;`;

        const stmt = db.prepare(sql);
        const results = stmt.all(...params) as any[];

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No results found for exactly: ${query_expansion_keywords}. Try expanding the search with more generic synonyms.`,
              },
            ],
          };
        }

        const formattedResults = results
          .map(
            (row) =>
              `---\n**Title:** ${row.title}\n**URL:** ${row.url || "N/A"}\n**Context Snippet:**\n${row.context}`
          )
          .join("\n\n");

        return {
          content: [{ type: "text", text: formattedResults }],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Database retrieval error. The local DB may be uninitialized or missing: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
