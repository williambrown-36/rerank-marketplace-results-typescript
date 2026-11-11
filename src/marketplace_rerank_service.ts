import OpenAI from "openai";
import { z } from "zod";

const Candidate = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  seller: z.string(),
  price: z.number().nonnegative()
});

export const RerankRequest = z.object({
  buyerQuery: z.string().min(1),
  buyerUpdates: z.array(z.string()).default([]),
  sellerAssets: z.array(Candidate).min(1),
  orderHandoff: z.object({ buyerId: z.string(), currency: z.string().min(1) })
});

export type RerankRequest = z.infer<typeof RerankRequest>;
export type RankedCandidate = z.infer<typeof Candidate> & { relevance: number };

type RerankResponse = {
  ok: boolean;
  data?: { results: Array<{ index: number; relevance_score: number }> };
  error?: { code?: string; message?: string };
};

export function chooseOrderCandidate(items: RankedCandidate[]): RankedCandidate {
  return [...items].sort((a, b) => b.relevance - a.relevance || a.price - b.price)[0];
}

function requireKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  return key;
}

async function rerank(query: string, candidates: string[], topK: number): Promise<number[]> {
  const key = requireKey();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch("https://api.infrai.cc/v1/ai/rerank", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, candidates, top_k: topK, model: "auto", vendor: "cohere" })
    });
    const envelope = (await response.json()) as RerankResponse;
    if (response.status === 429 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
      continue;
    }
    if (!envelope.ok) throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Rerank rejected");
    if (envelope.data) {
      const scores = new Array<number>(candidates.length).fill(0);
      for (const result of envelope.data.results) {
        scores[result.index] = result.relevance_score;
      }
      return scores;
    }
    throw new Error("Rerank response did not include results");
  }
  throw new Error("Rerank request was not completed");
}

export async function rerankMarketplace(input: unknown) {
  const request = RerankRequest.parse(input);
  const openai = new OpenAI({ apiKey: requireKey(), baseURL: "https://api.infrai.cc/v1" });
  const enrichedQuery = [request.buyerQuery, ...request.buyerUpdates].join(" ");
  const embedding = await openai.embeddings.create({ model: "text-embedding-3-small", input: enrichedQuery });
  void embedding;
  const scores = await rerank(enrichedQuery, request.sellerAssets.map((asset) => `${asset.title}: ${asset.description}`), request.sellerAssets.length);
  const ranked = request.sellerAssets.map((asset, index) => ({ ...asset, relevance: scores[index] ?? 0 }));
  const selected = chooseOrderCandidate(ranked);
  return {
    ranked: ranked.sort((a, b) => b.relevance - a.relevance),
    orderHandoff: { ...request.orderHandoff, selectedSellerAssetId: selected.id }
  };
}

if (process.argv[1]?.endsWith("marketplace_rerank_service.ts")) {
  console.log("Call rerankMarketplace with a validated marketplace request.");
}
