# Cards Against Orbis

A party card game in the style of Cards Against Humanity. When a card wins, you
see it happen: [Orbis](https://www.visko.ai) makes the winning sentence into
live video.

Built for the
[Visko Orbis Online Challenge, September 2026](https://www.visko.ai/challenge/orbis-september-2026).
Deadline: **October 1, 2026, 12:00 PM PT**.

## How it plays

1. 3 or more players sit around one screen (a laptop or a TV).
2. Each round, one player is the judge. The judge reads a black card out loud,
   for example: "The new museum exhibit is just \_\_\_\_."
3. The other players pick a white card from their hand, one at a time. The
   screen asks to pass the device between players.
4. The judge sees the answers with no names and picks the funniest one.
5. **The reveal:** the winning sentence goes to Orbis, and the big video turns
   into that scene, live. The winner gets a point.
6. The judge role moves to the next player. Repeat.

## Why Orbis is the point, not a gimmick

Orbis does not make a clip. It runs one live video stream, and a new prompt
steers it in about 1.8 seconds. So:

- The video never stops. One live "world" runs for the whole game.
- Each winning card steers that same world. The scenes flow into each other,
  so a game becomes one strange story that the players wrote together.
- Between rounds, the last winner keeps playing on the big screen while players
  pick cards.

This matches the first judging rule: real-time interaction must be essential.

## Judging criteria (from the challenge page)

1. **Real-time interaction:** Orbis must be an essential part of the experience.
2. **Creativity:** an original use case past normal video.
3. **Functionality:** the core interaction must work clearly. It does not need
   to be polished.

## Stack

- Next.js 16 + React 19, from the
  [Orbis starter](https://github.com/Visko-Platform/orbis-online-hackathon-starter).
- `@reactor-team/js-sdk` to connect to `reactor/visko-orbis-stable` over WebRTC.
- A `REACTOR_API_KEY` in `.env.local` (copy `.env.example`). The key stays on
  the server; the browser only gets a short-lived JWT from `/api/token`.

See [PLAN.md](PLAN.md) for what is done and what is next.
