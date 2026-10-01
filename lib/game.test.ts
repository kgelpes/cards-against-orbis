import assert from "node:assert/strict";
import { test } from "node:test";

import { BLANK, crown, fill, judgeOf, newGame, nextRound, play, waitingOn } from "./game.ts";

const decks = {
  black: ["Breaking news: ____ is loose in the mall.", "____ wins gold.", "Nature documentary."],
  white: Array.from({ length: 60 }, (_, i) => `card ${i}`),
};

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

test("fill puts the answer in the blank", () => {
  assert.equal(
    fill("Breaking news: ____ is loose.", "a llama"),
    "Breaking news: A llama is loose.",
  );
  assert.equal(fill("I saw ____ today.", "a llama."), "I saw a llama today.");
  assert.equal(fill("____ wins gold.", "a llama"), "A llama wins gold.");
  assert.equal(fill("Nature documentary.", "a llama"), "Nature documentary. a llama.");
});

test("a full round with humans and bots", () => {
  const random = seeded(7);
  let game = newGame(
    [
      { name: "Ana", bot: false },
      { name: "Ben", bot: false },
      { name: "Orbot", bot: true },
    ],
    decks,
    1,
    random,
  );
  assert.equal(game.phase, "picking");
  for (const player of game.players) {
    assert.equal(player.hand.length, 7);
    assert.ok(player.hand.includes(BLANK));
  }

  const humans = waitingOn(game);
  assert.ok(humans.every((player) => !player.bot));
  assert.ok(!humans.some((player) => player.id === judgeOf(game).id));

  for (const player of humans) {
    const blank = player.hand.includes(BLANK);
    const card = blank ? BLANK : player.hand[0];
    game = play(game, player.id, card, "a giant snail", random);
    assert.equal(game.players.find((item) => item.id === player.id)?.hand.length, 7);
  }

  assert.equal(game.phase, "judging");
  assert.equal(game.picks.length, 2);
  const before = judgeOf(game).id;
  game = crown(game, 0);
  assert.equal(game.phase, "reveal");
  assert.equal(game.history.length, 1);
  assert.equal(game.players.find((p) => p.id === game.winner?.playerId)?.score, 1);

  game = nextRound(game, decks.black, random);
  assert.equal(game.phase, "over");
  assert.ok(before);
});

test("judge rotates and blank card needs text", () => {
  const random = seeded(3);
  let game = newGame(
    [
      { name: "A", bot: true },
      { name: "B", bot: true },
      { name: "C", bot: false },
    ],
    decks,
    5,
    random,
  );
  while (game.phase === "picking") {
    const [human] = waitingOn(game);
    assert.equal(play(game, human.id, BLANK, "   ", random), game);
    game = play(game, human.id, human.hand.find((card) => card !== BLANK) ?? BLANK, "x", random);
  }
  const judge = game.judge;
  game = nextRound(crown(game, 1), decks.black, random);
  assert.equal(game.phase, "picking");
  assert.equal(game.judge, (judge + 1) % 3);
});

test("an empty white deck refills from the discard pile", () => {
  const random = seeded(11);
  let game = newGame(
    [
      { name: "A", bot: true },
      { name: "B", bot: true },
      { name: "C", bot: true },
    ],
    { black: decks.black, white: decks.white.slice(0, 20) },
    99,
    random,
  );
  for (let round = 0; round < 30; round++) {
    assert.equal(game.phase, "judging", `round ${round} stuck in ${game.phase}`);
    game = nextRound(crown(game, 0), decks.black, random);
  }
});
