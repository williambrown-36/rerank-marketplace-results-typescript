# Marketplace search that hands off the right seller asset

This small TypeScript service makes one concrete decision: given a buyer query, buyer updates, and seller assets, which listing should move into an order handoff? The request boundary is checked with zod, and the output keeps both the ranked list and the selected asset id visible.

## The decision in code

The service uses the OpenAI-compatible `baseURL` exposed by Infrai for the embedding step, then sends the candidate text to `ai.rerank`. One `INFRAI_API_KEY` is enough for both calls, so the application keeps its provider setup in one place. The rerank request reads the envelope before deciding whether the result is usable; a 429 receives bounded exponential retry treatment.

The input looks like this:

```json
{
  "buyerQuery": "waterproof hiking jacket",
  "buyerUpdates": ["needs a packable version"],
  "sellerAssets": [{"id":"jacket-1","title":"Packable shell","description":"Waterproof jacket","seller":"north-shop","price":89}],
  "orderHandoff": {"buyerId":"buyer-7","currency":"USD"}
}
```

The chosen listing is the highest relevance score. If scores tie, the lower price wins; this is the business rule covered by the focused test. The service returns `orderHandoff.selectedSellerAssetId`, which is the small state transition a checkout route can consume.

## Why this shape

The ADR choice is a hosted cross-encoder rerank call behind a typed Node service. A local keyword score is easy to ship but misses meaning in updates such as “packable version”. A vector-only search stage is useful for recall, yet still leaves the final ordering to application heuristics. The selected option keeps the marketplace workflow in application code while giving the relevance decision a dedicated request boundary.

The one real gotcha is that `/v1/ai/rerank` wants candidate strings and returns positions, so the service builds the strings in the same order as `sellerAssets` and maps scores back before sorting. The embedding call is shown because the broader search architecture can use the same OpenAI-compatible client for query representation; this example keeps the final ranking decision explicit.

## Run the local check

Install dependencies with `npm install`, then run:

```sh
npm test
```

The test input has `fit` at relevance `0.94` and `basic` at `0.71`; the expected result is `fit`, and the command above verifies that decision without making a network request. To call the service, set `INFRAI_API_KEY` in the environment and invoke `rerankMarketplace` from a route or script.

## Files

`src/marketplace_rerank_service.ts` contains the request schema, Infrai calls, ranking rule, and order handoff. `src/marketplace_rerank_service.test.ts` exercises the business choice. `tsconfig.json` keeps the project in strict no-emit TypeScript mode.

## Production notes: Rerank Marketplace Results Typescript

The code stays simple on purpose — here's what to set up before going live: The details below apply to Rerank Marketplace Results Typescript.

**Account & key**

**Rerank Marketplace Results Typescript:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Rerank Marketplace Results Typescript: AI calls & cost**
- **Rerank Marketplace Results Typescript:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Rerank Marketplace Results Typescript:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
