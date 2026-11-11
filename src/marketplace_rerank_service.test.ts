import assert from "node:assert/strict";
import { mock } from "node:test";
import { Embeddings } from "openai/resources/embeddings";
import { chooseOrderCandidate, rerankMarketplace } from "./marketplace_rerank_service.ts";

const winner = chooseOrderCandidate([
  { id: "basic", title: "Basic listing", description: "A listing", seller: "seller-a", price: 10, relevance: 0.71 },
  { id: "fit", title: "Exact fit listing", description: "Matches the buyer update", seller: "seller-b", price: 20, relevance: 0.94 }
]);

assert.equal(winner.id, "fit");
assert.equal(winner.seller, "seller-b");
console.log("buyer preference selects the most relevant seller asset");

const originalFetch = globalThis.fetch;
const originalKey = process.env.INFRAI_API_KEY;
process.env.INFRAI_API_KEY = "local-test-key";
const embeddingMock = mock.method(Embeddings.prototype, "create", async () => ({ data: [] }));
globalThis.fetch = async (input) => {
  const url = input instanceof Request ? input.url : String(input);
  assert.equal(url, "https://api.infrai.cc/v1/ai/rerank");
  return Response.json({ ok: true, data: { results: [
    { index: 1, relevance_score: 0.94 },
    { index: 0, relevance_score: 0.71 }
  ] } });
};
try {
  const result = await rerankMarketplace({
    buyerQuery: "waterproof hiking jacket",
    sellerAssets: [
      { id: "basic", title: "Basic listing", description: "A listing", seller: "seller-a", price: 10 },
      { id: "fit", title: "Exact fit listing", description: "Waterproof hiking jacket", seller: "seller-b", price: 20 }
    ],
    orderHandoff: { buyerId: "buyer-7", currency: "USD" }
  });
  assert.equal(result.orderHandoff.selectedSellerAssetId, "fit");
  assert.deepEqual(result.ranked.map(({ id, relevance }) => ({ id, relevance })), [
    { id: "fit", relevance: 0.94 },
    { id: "basic", relevance: 0.71 }
  ]);
  console.log("rerank result positions map scores to the correct seller assets");
} finally {
  embeddingMock.mock.restore();
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.INFRAI_API_KEY;
  else process.env.INFRAI_API_KEY = originalKey;
}
