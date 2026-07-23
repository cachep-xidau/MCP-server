// OpenAI embeddings for semantic knowledge-base search, exposed as a ChromaDB
// embedding function so queries use the SAME model as ingestion.
//
//   OPENAI_API_KEY      - OpenAI API key (required at query time).
//   OPENAI_EMBED_MODEL  - embedding model id (default text-embedding-3-small).

import OpenAI from "openai";
import type { IEmbeddingFunction } from "chromadb";

export const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

let client: OpenAI | null = null;
function getClient(): OpenAI {
  // Reads OPENAI_API_KEY from the environment; lazy so the server boots without it.
  if (!client) client = new OpenAI();
  return client;
}

/** ChromaDB embedding function backed by OpenAI text-embedding-3-small. */
export const openAIEmbeddingFunction: IEmbeddingFunction = {
  generate: async (texts: string[]): Promise<number[][]> => {
    const res = await getClient().embeddings.create({ model: EMBED_MODEL, input: texts });
    return res.data.map((d) => d.embedding);
  },
};
