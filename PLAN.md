# Plan

## Status

The app does **not** run yet. This commit is the scaffold only.

Done:

- Repo made with `new-project` (oxlint, oxfmt, TypeScript, anti-slop rules).
- Starter code copied from
  [orbis-online-hackathon-starter](https://github.com/Visko-Platform/orbis-online-hackathon-starter):
  `app/`, `components/`, `hooks/`, `lib/`, `scripts/`, `next.config.ts`,
  `.env.example`, `tsconfig.json`.
- Removed from the starter: the Nano Banana (Gemini) example, `dog.png`,
  `components/orbis-controls.tsx`, `lib/orbis-prompt.ts`, and the
  `nano-banana` and `orbis-prompt` API routes.

Not done:

- **Dependencies are not installed.** `package.json` has only the lint tools.
  Add:

  ```bash
  pnpm add next@16.3.5 react@19.2.3 react-dom@19.2.3 @next/env@^16.3.5 @reactor-team/js-sdk@^3.0.2 zustand@^5.0.11 hls.js@^1.6.13
  ```

  ```bash
  pnpm add -D @types/node@^22 @types/react@^19.2.7 @types/react-dom@^19.2.3
  ```

  Then add the scripts `"dev": "node scripts/dev-with-session-cleanup.mjs"`,
  `"build": "next build"`, `"start": "next start"`.

- **Broken imports to fix:** `components/orbis-demo.tsx` still imports
  `NanoBananaExample` and `OrbisControls`. `hooks/use-orbis-session.ts` still
  has `nanoBusy` and `startFromNanoOutput`. `app/styles.css` still has the Nano
  Banana styles.

## Build steps

1. **Install and fix imports** (above). Check that `pnpm dev` opens the player.
2. **Add `show(text)` to `hooks/use-orbis-session.ts`.**
   - If no run is active: call the existing `startGeneration(null, text)`
     (it does `set_prompt`, waits for `conditions_ready`, then `start`).
   - If a run is active: `sendCommand("set_prompt", { prompt: text })`. This
     steers the live video at the next chunk.
3. **`lib/cards.ts`:** about 30 black cards and 100 white cards. Write our own
   text. Pick cards that make strong pictures (places, objects, actions), not
   abstract jokes. Black cards use `____` for the blank.
4. **`lib/game.ts`:** pure game logic, no React.
   - State: players (name, hand, score), judge index, black card, picks, phase.
   - Phases: `lobby` → `picking` (pass device to each player) → `judging` →
     `reveal` → next round.
   - `fill(black, white)`: put the white card in the blank. No blank → add it
     at the end.
   - One test file, `lib/game.test.ts`, run with `node --test lib/`.
5. **`components/game.tsx`:** the game UI. The video is big at the top. The
   cards are under it.
6. **Orbis prompts:**
   - When the game starts: start a lobby scene, for example "a smoky game show
     stage, red curtains, spotlights, waiting audience". So the stream is warm
     before the first reveal.
   - On reveal: `show(\`${sentence}. Cinematic, absurd, photoreal comedy scene,
     dramatic lighting.\`)`.
7. **Replace** `app/page.tsx` and `components/orbis-demo.tsx` to render the
   game in the `ReactorProvider`.
8. **Record the demo video** and send the submission form.

## Ideas, if there is time

- **Live preview while judging:** when the judge taps an answer, the video
  steers to it. The judge "tries on" each answer, then crowns one. This makes
  real-time even more central.
- **Phones as hands:** each player uses a phone; the TV shows only the video.
  Needs a small realtime backend (for example a Cloudflare Durable Object).
- **Gemini prompt rewrite:** turn the sentence into a better visual prompt. Needs
  a `GEMINI_API_KEY`.

## Links

- Challenge: https://www.visko.ai/challenge/orbis-september-2026
- Submission form: https://docs.google.com/forms/d/e/1FAIpQLSf9DKLXYH8ou_cu1EZP5bWMIiCg854mFReKRTUbjaynjaYNQg/viewform
- Reactor account and API key: https://reactor.inc
- Orbis Stable API: https://www.reactor.inc/models/visko-orbis-stable/api
