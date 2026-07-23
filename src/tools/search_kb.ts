import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Database from "better-sqlite3";
import path from "path";
import { resolveAclScope, AclDeniedError } from "../security/access-control.js";

// Open the authoritative remote-rag.db in place on the VPS (single source of truth).
// Override the location with DB_PATH; defaults to the current working directory.
const dbPath = process.env.DB_PATH || path.join(process.cwd(), "remote-rag.db");

// Lazy load DB so the server can boot globally even if DB is missing on fresh laptops
let db: Database.Database | null = null;

export function setupSearchTool(server: McpServer) {
  server.tool(
    "search_company_kb",
    "Search the FTS5-BM25 knowledge base for company documents, rules, APIs, and Jira context. Results are ACL-scoped to the caller's permitted projects. USE MULTIPLE SYNONYMS via FTS5 'OR' operators for best results.",
    {
      query_expansion_keywords: z
        .string()
        .describe("FTS5 query string using AND/OR operators. Example: 'authentication OR login OR sign-in OR oauth'"),
      project_id: z
        .string()
        .optional()
        .describe("Optional Project identifier to narrow document domains, e.g., 'AIA', 'SUZ', 'AAV'. Must be within your ACL scope."),
    },
    async ({ query_expansion_keywords, project_id }) => {
      try {
        // Resolve the caller's ACL scope first; deny out-of-scope project requests.
        let scope;
        try {
          scope = resolveAclScope(project_id);
        } catch (err) {
          if (err instanceof AclDeniedError) {
            return { content: [{ type: "text", text: err.message }] };
          }
          throw err;
        }

        if (!db) {
          db = new Database(dbPath, { readonly: true });
        }

        // FTS5 external-content table 'pages_fts' joined to base table 'pages'.
        // snippet() keeps returned context small to cut LLM token usage.
        let sql = `
          SELECT
            p.title,
            snippet(pages_fts, -1, '[MATCH]', '[/MATCH]', '...', 64) as context,
            p.url
          FROM pages_fts f
          JOIN pages p ON f.rowid = p.id
          WHERE pages_fts MATCH ?
        `;

        const params: any[] = [query_expansion_keywords];

        // ACL pre-filter: restrict rows to the caller's permitted projects so
        // out-of-scope documents never enter the result set (requires a
        // 'project' column on the 'pages' table, populated at ingestion).
        if (scope.projects.length > 0) {
          const placeholders = scope.projects.map(() => "?").join(", ");
          sql += ` AND p.project IN (${placeholders})`;
          params.push(...scope.projects);
        }

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
