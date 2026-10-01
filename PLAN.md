# Plan

## Status

The game is built and runs end to end against Orbis Stable.

Done:

- Game rules in `lib/game.ts` with tests (`pnpm test`).
- 45 black and 150 white original cards in `lib/cards.ts`.
- `show(prompt)` in `hooks/use-orbis-session.ts`: first call starts the run,
  later calls steer it. Restarts the run if Orbis ends it.
- Studio UI in `components/game.tsx`: title and seats, bots, pass-the-screen
  gate, write-your-own cards, flip-to-preview live judging, reveal, finale
  reel with clips, full-episode download.
- Token route allows one session of up to 60 minutes.

## Submit

- Challenge: https://www.visko.ai/challenge/orbis-september-2026
- Form: https://docs.google.com/forms/d/e/1FAIpQLSf9DKLXYH8ou_cu1EZP5bWMIiCg854mFReKRTUbjaynjaYNQg/viewform
- Needs: team name, member names and emails, description, repository URL.
  Demo video is optional.

## Ideas, if there is time

- **Phones as hands:** each player uses a phone; the TV shows only the video.
  Needs a small realtime backend (for example a Cloudflare Durable Object).
- **Audio prompts per black card** with `set_audio_prompt`.
