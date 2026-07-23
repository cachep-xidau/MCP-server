// ChromaDB vector store access for the company knowledge base.
//
//   CHROMA_URL         - ChromaDB server URL (default http://localhost:8000).
//   CHROMA_COLLECTION  - collection name (default company_kb).
//
// Documents are embedded and upserted by the external ingestion job with
// metadata { project, title, url }; the 'project' field powers the ACL filter.

import { ChromaClient, type Collection } from "chromadb";
import { openAIEmbeddingFunction } from "./embeddings.js";

const CHROMA_URL = process.env.CHROMA_URL || "http://localhost:8000";
const COLLECTION = process.env.CHROMA_COLLECTION || "company_kb";

export interface KbHit {
  title: string;
  url: string;
  snippet: string;
}

let collection: Collection | null = null;
async function getCollection(): Promise<Collection> {
  if (!collection) {
    const client = new ChromaClient({ path: CHROMA_URL });
    collection = await client.getCollection({
      name: COLLECTION,
      embeddingFunction: openAIEmbeddingFunction,
    });
  }
  return collection;
}

/**
 * Semantic search over the KB, restricted to the caller's permitted projects.
 * An empty `projects` list means unrestricted. Returns up to `topK` hits.
 */
export async function searchKb(
  query: string,
  projects: string[],
  topK = 5
): Promise<KbHit[]> {
  const col = await getCollection();

  // ACL pre-filter: restrict candidates to permitted projects before ranking.
  const where = projects.length > 0 ? { project: { $in: projects } } : undefined;
  const res = await col.query(
    where
      ? { queryTexts: [query], nResults: topK, where }
      : { queryTexts: [query], nResults: topK }
  );

  const docs = res.documents?.[0] ?? [];
  const metas = res.metadatas?.[0] ?? [];

  return docs.map((doc, i) => {
    const meta = (metas[i] ?? {}) as Record<string, unknown>;
    return {
      title: String(meta.title ?? "Untitled"),
      url: String(meta.url ?? "N/A"),
      snippet: doc ?? "",
    };
  });
}
