import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveAclScope, AclDeniedError } from "../security/access-control.js";
import { searchKb } from "../kb/vector-store.js";
import { rerank } from "../kb/reranker.js";

// Vector-search candidate pool, reranked down to the final result count.
const CANDIDATE_K = Number(process.env.RERANK_CANDIDATES || "30");
const FINAL_K = 5;

export function setupSearchTool(server: McpServer) {
  server.tool(
    "search_company_kb",
    "Semantic search over the company knowledge base (OpenAI embeddings + ChromaDB). Results are ACL-scoped to the caller's permitted projects. Returns the top-5 most relevant documents.",
    {
      query: z
        .string()
        .describe("Natural-language question or search phrase, e.g. 'notification rules for onboarding'."),
      project_id: z
        .string()
        .optional()
        .describe("Optional project key to narrow the search, e.g. 'AIA'. Must be within your ACL scope."),
    },
    async ({ query, project_id }) => {
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

        // Vector-search ChromaDB (OpenAI embeddings) restricted to the ACL scope,
        // then rerank the candidate pool down to the final results.
        const candidates = await searchKb(query, scope.projects, CANDIDATE_K);
        const hits = await rerank(query, candidates, FINAL_K);

        if (hits.length === 0) {
          return {
            content: [{ type: "text", text: `No results found for: ${query}` }],
          };
        }

        const formatted = hits
          .map((h) => `---\n**Title:** ${h.title}\n**URL:** ${h.url}\n**Context:**\n${h.snippet}`)
          .join("\n\n");

        return { content: [{ type: "text", text: formatted }] };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `KB search error (check OPENAI_API_KEY / ChromaDB availability): ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
