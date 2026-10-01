# Cards Against Orbis

**The party card game where the winning card comes to life as live AI video.**

Fill in the blank like any late-night card game. Then the judge flips each
answer, and the big screen _turns into that scene_, live, in a few seconds.
The judge watches every answer play out, crowns the best one, and that world
keeps running on screen while the next round starts.

Built for the
[Visko Orbis Online Challenge, September 2026](https://www.visko.ai/challenge/orbis-september-2026)
on [Orbis Stable](https://www.reactor.inc/models/visko-orbis-stable/api).

## How it plays

1. 3 to 8 players share one screen (laptop or TV). Bots can fill seats, so you
   can play alone with two bots.
2. Each round one player is the **judge**. A black card sets a scene:
   _"Wedding video: the guests gasp as the bride walks down the aisle arm in arm
   with \_\_\_\_."_
3. Everyone else plays a white card from a hand of 7. The screen hides each hand
   until the right player taps "Show my cards", so you pass the device around.
   **Write-your-own** blank cards let you type anything, and it becomes video.
4. **Live judging.** Answers arrive face down. The judge flips each one, and
   Orbis steers the live video to that sentence. The judge literally watches
   each answer before crowning one.
5. **The reveal.** Confetti, a point, and the winning scene keeps playing.
6. First to 3, 5 or 7 points wins. The finale shows **the reel**: a clip of every
   winning scene, plus a download of the full episode.

## Why Orbis is the game, not a gimmick

Orbis runs one continuous, steerable video stream. That shapes every part of
the design:

- **One world for the whole game.** The stream never cuts. Each preview and each
  winner morphs the same world into the next scene, so a game becomes one
  strange movie that the table wrote together.
- **Judging is real-time interaction.** The judge flips through answers and the
  scene follows each tap within a few seconds. Without real-time steering,
  this mechanic cannot exist.
- **The video is the scoreboard of taste.** Players learn to write for the
  camera: concrete, filmable, absurd.
- **Warm-up is hidden in play.** The studio connects when the game starts, so
  the model boots while players pick their first cards.

## Run it

Needs Node 22+, pnpm, and a Reactor API key from [reactor.inc](https://reactor.inc).

```bash
cp .env.example .env.local
```

Put your key in `.env.local` as `REACTOR_API_KEY=...`, then:

```bash
pnpm install
```

```bash
pnpm dev
```

Open http://localhost:3000, add players (or bots), and press **Open the studio**.
The first boot of the model can take a minute; play cards while it warms up.

## How it works

| Piece                        | What it does                                                                                                                                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/game.ts`                | Pure game rules: deal, play, judge rotation, crown, bots, write-in cards. Tested with `pnpm test`.                                                                                                                                  |
| `lib/cards.ts`               | 45 black and 150 white original cards, written to make strong pictures (places, camera setups, creatures, chaos), not text-only jokes.                                                                                              |
| `hooks/use-orbis-session.ts` | `show(prompt)`: the first call does `set_prompt` → waits for `conditions_ready` → `start`; later calls `set_prompt` on the live run. Fast taps coalesce to the latest prompt. Restarts the run if Orbis ends it. Clips and episode download use the SDK recorder. |
| `components/game.tsx`        | The studio UI: live stage with ambient glow, chyron captions, hands, flip-to-preview judging, reveal, finale reel.                                                                                                                  |
| `app/api/token/route.ts`     | Exchanges the server-side API key for a short-lived, single-session JWT. The key never reaches the browser.                                                                                                                         |

Stack: Next.js 16, React 19, `@reactor-team/js-sdk`, Motion, canvas-confetti.
