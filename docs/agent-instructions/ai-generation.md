# AI generation invariants

## Prompt caching and cost optimization

Every step of a multi-step AI run re-reads the growing conversation history, so the input token count scales quadratically with the number of turns. Prompt caching converts most of that re-read cost into 90% discounted cache reads. The runner applies provider-specific cache routing:

- **Anthropic**: explicit `cacheControl` breakpoint on the last message, moved forward by `prepareStep` on each step (`src/ai/prompt-caching.ts`). Without this, Anthropic caches nothing and every step pays the full input price.
- **OpenAI**: per-run `promptCacheKey` in `providerOptions.openai` keeps every step of the tool loop on the same cache replica for reliable prefix matching. GPT-5.6 caches automatically with a 30-minute TTL; cache writes are billed at 1.25× but reads get the 90% discount.
- **Google Gemini**: implicit caching is automatic on 2.5+ models. No configuration needed; savings are passed through when request prefixes match.

The prompt in `src/ai/prompt.ts` instructs the model to batch independent tool calls in one turn (whole slide composition, repair rounds, final preview pass) rather than issuing calls one at a time. Batching directly reduces the number of turns and therefore the quadratic input token cost. Measurement boxes are rounded to one decimal (`src/ai/measure.ts`) to keep tool-result payloads compact across the accumulated history.

## Security and provider boundary

The browser uses the AI SDK's native Google, Alibaba/Qwen, OpenAI, Anthropic, and xAI providers directly. Moonshot uses the OpenAI chat provider through the local `/api/moonshot` CORS proxy.

- Provider keys are entered in the browser (AI generate modal → API keys) and stored unencrypted in `localStorage` under `shotluma-ai-provider-keys`. Optional `.env.local` `VITE_*` values work only through the local dev server and merge underneath browser keys. Production builds must replace every provider env value with an empty string.
- Keys are intentionally visible to same-origin browser JavaScript. Never commit `.env.local`, reuse a shared production credential, or weaken the production build boundary. Recommend dedicated keys with restrictive quotas.
- Do not add a proxy for providers whose browser API supports the required CORS flow. Moonshot is available only on localhost through `/api/moonshot`; a hosted deployment that offers Moonshot or must hide keys needs a separate authenticated backend design.
- Never return secrets or raw data URLs in model-visible state.
- Keep uploads browser-local except for screenshots and app logos explicitly included in an AI run.
- In generate mode, collect app name and app logo separately from the app description and screenshots. Pass the name and logo asset id through the user message, attach the logo image, and instruct the model to place the logo with `add_image` (never as a device screenshot).
- Keep developer AI run logging gated by `SHOTLUMA_AI_LOGGING` and write only
  through the local Vite middleware to the git-ignored `ai-logs/` directory.
  Persist only the versioned, bounded log schema: never add input prompt text,
  screenshot payloads or names, credentials, or raw provider metadata.

## Tool architecture

The model mutates the editor only through the tools composed by `src/ai/tools.ts`.

- Tool groups validate with Zod and delegate mutations to `AiEditorController`.
- Clamp every numeric model input to the editor range.
- Return `{ ok: false, error }` for expected failures; do not throw.
- Keep Zod descriptions accurate because they are model-facing API documentation.
- Add new element fields to the type, defaults, renderer, controller whitelist, and `update_element` as applicable.
- Emit `AiToolActivity` for visible mutations.
- Return real DOM measurements after element mutations.
- Icons: the model places Hugeicons via `add_icon` and updates them via `update_element` (fields: `icon`, `color`, `strokeWidth`, `shadow`). The curated icon library lives in `src/icons.ts`. The model must NEVER use emoji characters on canvas; always use `add_icon` instead.
- Keep `inspect_slide` and `render_slide_preview` as the visual correction loop.
- Keep edit mode scoped to its target slide.
- Overlay assets (opt-in via the generate modal): `create_overlay_asset` calls OpenAI `gpt-image-2` through the AI SDK `generateImage` API and registers the result with `AiEditorController.addAsset`. Because `gpt-image-2` cannot emit transparency, generation always uses a flat `#FF00FF` chroma-key backdrop (`src/ai/overlay-asset-prompt.ts`). `remove_asset_background` then strips that key in-browser via Canvas (`src/ai/remove-chroma-key-background.ts`, pure pixel math in `src/ai/chroma-key.ts`) and registers a transparent PNG. The key color is measured per image with `detectChromaKey` rather than assumed to be `#FF00FF` — the model only approximates the requested backdrop, and keying against the nominal color leaves the whole background half-transparent (a pink haze). Keep the ramp wide, keep the despill pass, and keep reporting `backgroundCleared` so a failed key is visible instead of silently shipping a hazy asset. Do not use these tools for mockups, device frames, or full screens — only cutout elements placed with `add_image`. Require a resolved OpenAI key (browser storage or local-dev `VITE_OPENAI_API_KEY`) even when the chat model uses another provider. Never log generated image payloads.
- Overlay generation is budgeted: `OVERLAY_ASSET_BUDGET` in `src/ai/overlay-asset-prompt.ts` caps `create_overlay_asset` calls per run, counted per `createOverlayAssetTools` instance and consumed by failed attempts too, so a retry loop cannot burn the OpenAI key. The prompt section in `src/ai/prompt.ts` and the tool descriptions must keep stating the same number — read it from the constant rather than hardcoding it.

## Editor integration

The controller adapter must update `slidesRef` synchronously before React state because multiple tool calls can read and write in one tick. Preserve the non-history adapter and create one checkpoint before a run so the entire generation remains one undo step.

Clear selection before generation and preview capture. Any live overlay must carry `data-ai-overlay` and remain filtered from preview and export.

## Canvas and prompt contract

- Coordinates and widths are percentages of the `1290 × 2796` canvas.
- Text `fontSize` is CSS pixels on the internal 330 px-wide DOM artboard.
- Hero: `32–46`; sub-headline: `18–24`; body: `13–17`; label: `9–12`.
- Values above roughly `52` are usually a four-times sizing error.
- Keep these values identical in `prompt.ts`, schemas, tool descriptions, and documentation.
- Keep loaded font names aligned with `src/main.tsx`.
- Keep the prompt's repair-round limit aligned with preview behavior.
- Keep AI-generated canvas copy and completion summaries in English, regardless of the language used in the request.

Rich text comes from structured highlights through `src/ai/richtext.ts`. The model never writes raw HTML. `sanitizeRichText` remains the final whitelist.

The stream runner reports errors and aborts as events instead of rejecting. Preserve visible reasoning progress for long-running reasoning models.

Reasoning-effort choices belong to the model catalog. Offer only values supported by the selected model (never a provider-default option) and default to `high` when the model supports it, otherwise `medium`. Pass portable efforts through the AI SDK's top-level `reasoning` option. OpenAI GPT-5.6 (Luna/Terra/Sol) and Moonshot/Kimi K3 also offer `max`, which the runner sends via OpenAI-compat `providerOptions.openai.reasoningEffort` because the shared SDK option has no `max`. Do not duplicate provider-specific effort mapping in the UI. The generate modal exposes one model picker grouped by provider; reasoning effort appears as secondary chips only when the selected model supports it.
