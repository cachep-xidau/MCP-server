// Reranking via a self-hosted BAAI/bge-reranker-v2-m3 cross-encoder (MIT
// licence, free for commercial use), served over HTTP — e.g. HuggingFace
// Text Embeddings Inference (TEI) exposing a POST /rerank endpoint.
//
//   RERANKER_URL  - base URL of the rerank service; unset = rerank disabled
//                   (falls back to vector order).

import type { KbHit } from "./vector-store.js";

const RERANKER_URL = process.env.RERANKER_URL || "";

interface RerankResult {
  index: number;
  score: number;
}

/**
 * Rerank candidate hits against the query with the cross-encoder and return the
 * top-K. Fails open: if RERANKER_URL is unset or the service errors, the
 * candidates are returned in vector order (never blocks the query).
 */
export async function rerank(query: string, hits: KbHit[], topK: number): Promise<KbHit[]> {
  if (!RERANKER_URL || hits.length === 0) {
    return hits.slice(0, topK);
  }

  try {
    const res = await fetch(`${RERANKER_URL.replace(/\/$/, "")}/rerank`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, texts: hits.map((h) => h.snippet), raw_scores: false }),
    });

    if (!res.ok) return hits.slice(0, topK);

    // TEI returns [{ index, score }, ...] sorted by score descending.
    const ranked = (await res.json()) as RerankResult[];
    return ranked
      .slice(0, topK)
      .map((r) => hits[r.index])
      .filter((h): h is KbHit => Boolean(h));
  } catch {
    return hits.slice(0, topK);
  }
}
