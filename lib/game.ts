export const BLANK = "✎ Write your own";
export const HAND_SIZE = 7;

export type Player = {
  id: string;
  name: string;
  bot: boolean;
  hand: string[];
  score: number;
};

export type Pick = { playerId: string; card: string };

export type Round = {
  black: string;
  sentence: string;
  winnerId: string;
};

export type Phase = "picking" | "judging" | "reveal" | "over";

export type Game = {
  players: Player[];
  judge: number;
  black: string;
  blackDeck: string[];
  whiteDeck: string[];
  discard: string[];
  picks: Pick[];
  winner: Pick | null;
  history: Round[];
  target: number;
  phase: Phase;
};

export type Seat = { name: string; bot: boolean };

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function parts(black: string, white: string): [string, string, string] {
  const answer = white.trim().replace(/[.!?]+$/, "");
  if (!black.includes("____")) return [`${black} `, answer, "."];
  const [before, after] = black.split("____");
  const start = before.trim() === "" || /[.!?:]\s*$/.test(before);
  const word = start ? answer.charAt(0).toUpperCase() + answer.slice(1) : answer;
  return [before, word, after];
}

export function fill(black: string, white: string) {
  return parts(black, white).join("");
}

function botPicks(game: Game, random: () => number): Game {
  let next = game;
  for (const player of game.players) {
    if (!player.bot || player.id === judgeOf(game).id) continue;
    const options = player.hand.filter((card) => card !== BLANK);
    const card = options[Math.floor(random() * options.length)] ?? player.hand[0];
    next = play(next, player.id, card, "a very confused robot", random);
  }
  return next;
}

export function newGame(
  seats: Seat[],
  decks: { black: string[]; white: string[] },
  target: number,
  random = Math.random,
): Game {
  const whitePool = [...decks.white, ...Array.from({ length: 6 }, () => BLANK)];
  let whiteDeck = shuffle(whitePool, random);
  const players = seats.map((seat, index) => {
    const hand = [...whiteDeck.slice(0, HAND_SIZE - 1), BLANK];
    whiteDeck = whiteDeck.slice(HAND_SIZE - 1);
    return { id: `p${index}`, name: seat.name, bot: seat.bot, hand, score: 0 };
  });
  const blackDeck = shuffle(decks.black, random);
  const game: Game = {
    players,
    judge: Math.floor(random() * players.length),
    black: blackDeck[0],
    blackDeck: blackDeck.slice(1),
    whiteDeck,
    discard: [],
    picks: [],
    winner: null,
    history: [],
    target,
    phase: "picking",
  };
  return botPicks(game, random);
}

export function judgeOf(game: Game) {
  return game.players[game.judge];
}

export function waitingOn(game: Game) {
  const judge = judgeOf(game);
  return game.players.filter(
    (player) =>
      player.id !== judge.id &&
      !game.picks.some((pick) => pick.playerId === player.id),
  );
}

export function play(
  game: Game,
  playerId: string,
  card: string,
  written: string,
  random = Math.random,
): Game {
  if (game.phase !== "picking") return game;
  const player = game.players.find((item) => item.id === playerId);
  if (!player || player.id === judgeOf(game).id || !player.hand.includes(card)) {
    return game;
  }
  if (game.picks.some((pick) => pick.playerId === playerId)) return game;
  const answer = card === BLANK ? written.trim() : card;
  if (!answer) return game;

  const discard = card === BLANK ? game.discard : [...game.discard, card];
  const deck = game.whiteDeck.length ? game.whiteDeck : shuffle(discard, random);
  const hand = [...player.hand];
  hand.splice(hand.indexOf(card), 1, deck[0] ?? BLANK);
  const players = game.players.map((item) =>
    item.id === playerId ? { ...item, hand } : item,
  );
  const picks = [...game.picks, { playerId, card: answer }];
  const next = {
    ...game,
    players,
    picks,
    whiteDeck: deck.slice(1),
    discard: game.whiteDeck.length ? discard : [],
  };
  if (waitingOn(next).length > 0) return next;
  return { ...next, phase: "judging", picks: shuffle(picks, random) };
}

export function crown(game: Game, index: number): Game {
  const winner = game.picks[index];
  if (game.phase !== "judging" || !winner) return game;
  const players = game.players.map((player) =>
    player.id === winner.playerId ? { ...player, score: player.score + 1 } : player,
  );
  const round = {
    black: game.black,
    sentence: fill(game.black, winner.card),
    winnerId: winner.playerId,
  };
  return {
    ...game,
    players,
    winner,
    history: [...game.history, round],
    phase: "reveal",
  };
}

export function champion(game: Game) {
  return game.players.find((player) => player.score >= game.target) ?? null;
}

export function nextRound(
  game: Game,
  blackCards: string[],
  random = Math.random,
): Game {
  if (game.phase !== "reveal") return game;
  if (champion(game)) return { ...game, phase: "over" };
  const blackDeck = game.blackDeck.length ? game.blackDeck : shuffle(blackCards, random);
  return botPicks(
    {
      ...game,
      judge: (game.judge + 1) % game.players.length,
      black: blackDeck[0],
      blackDeck: blackDeck.slice(1),
      picks: [],
      winner: null,
      phase: "picking",
    },
    random,
  );
}
