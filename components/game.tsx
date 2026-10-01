"use client";

import { ReactorView } from "@reactor-team/js-sdk";
import confetti from "canvas-confetti";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Tube } from "@/components/tube";
import type { OrbisSession } from "@/hooks/use-orbis-session";
import { BLACK_CARDS, WHITE_CARDS } from "@/lib/cards";
import {
  BLANK,
  type Game as GameState,
  type Player,
  type Seat,
  champion,
  crown,
  fill,
  judgeOf,
  newGame,
  nextRound,
  parts,
  play,
  waitingOn,
} from "@/lib/game";
import { FINALE_PROMPT, LOBBY_PROMPT, scene } from "@/lib/orbis";
import { type PhoneMessage, type PublicState, useRoom } from "@/lib/room";
import QRCode from "qrcode";

const BOT_NAMES = [
  "Orbot 3000",
  "Pixel Grandma",
  "Captain Prompt",
  "Sir Renders-a-Lot",
  "The Algorithm",
  "Deep Fake Dave",
];
const TARGETS = [3, 5, 7];
const QUIPS = [
  "The studio audience is losing it.",
  "Orbis rendered that with a completely straight face.",
  "Somewhere, a film critic quietly weeps.",
  "This is now canon. The world remembers.",
  "Nobody asked for this. Everybody needed it.",
  "Roll it again. No, actually, keep it rolling.",
  "The producers are on the phone. They want a sequel.",
];
const COLORS = [
  "#ff5a4e",
  "#ffb547",
  "#5ad1ff",
  "#9b7bff",
  "#4fe0a6",
  "#ff7ac3",
  "#ffe27a",
  "#8fb3ff",
];
const SPRING = { type: "spring", duration: 0.3, bounce: 0.12 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export function Game({ orbis }: { orbis: OrbisSession }) {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [target, setTarget] = useState(3);
  const [game, setGame] = useState<GameState | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [clips, setClips] = useState<(string | null)[]>([]);
  const [cache, setCache] = useState<(string | null | undefined)[]>([]);
  const [rendering, setRendering] = useState<number | null>(null);
  const [winnerClip, setWinnerClip] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    setCode(
      Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join(""),
    );
  }, []);
  const desired = useRef("");
  const show = useRef(0);
  const live = useRef(orbis);
  live.current = orbis;
  const renderingRef = useRef<number | null>(null);
  renderingRef.current = rendering;
  const roundRef = useRef(0);
  roundRef.current = game?.history.length ?? 0;
  const want = (prompt: string) => {
    if (desired.current === prompt) return;
    desired.current = prompt;
    if (live.current.connected) live.current.show(prompt);
  };

  useEffect(() => {
    if (orbis.connected && desired.current) orbis.show(desired.current);
  }, [orbis.connected]);

  const phase = game?.phase;
  const rounds = game?.history.length ?? 0;
  const answerPrompt = (index: number) =>
    game ? scene(fill(game.black, game.picks[index]?.card ?? "")) : "";

  useEffect(() => {
    if (!game) return;
    if (game.phase === "judging") {
      for (const url of cache) if (url && !clips.includes(url)) URL.revokeObjectURL(url);
      setCache([]);
      setRendering(null);
      setPreview(null);
      setWinnerClip(null);
    }
    if (game.phase === "reveal") {
      const round = game.history[game.history.length - 1];
      want(scene(round.sentence));
      burst();
    }
    if (game.phase === "over") want(FINALE_PROMPT);
  }, [phase, rounds]);

  useEffect(() => {
    if (!game || game.phase !== "judging" || rendering !== null || !orbis.connected) return;
    const all = game.picks.map((_, index) => index);
    const order = preview === null ? all : [preview, ...all];
    const next = order.find((index) => cache[index] === undefined);
    if (next === undefined) {
      if (preview !== null && cache[preview] === null) want(answerPrompt(preview));
      return;
    }
    setRendering(next);
    want(answerPrompt(next));
  }, [phase, rendering, cache, preview, orbis.connected]);

  useEffect(() => {
    if (rendering === null || orbis.live !== answerPrompt(rendering)) return;
    const id = show.current;
    const index = rendering;
    const round = roundRef.current;
    const timer = setTimeout(async () => {
      const clip = await live.current.record(6);
      if (show.current !== id || roundRef.current !== round || renderingRef.current !== index) {
        if (clip) URL.revokeObjectURL(clip);
        return;
      }
      setCache((list) => {
        const next = [...list];
        next[index] = clip;
        return next;
      });
      setRendering(null);
    }, 1_200);
    return () => clearTimeout(timer);
  }, [rendering, orbis.live]);

  useEffect(() => {
    if (rendering === null) return;
    const index = rendering;
    const timer = setTimeout(() => {
      setCache((list) => {
        if (list[index] !== undefined) return list;
        const next = [...list];
        next[index] = null;
        return next;
      });
      setRendering((current) => (current === index ? null : current));
    }, 30_000);
    return () => clearTimeout(timer);
  }, [rendering]);

  useEffect(() => {
    if (!game || game.phase !== "reveal" || winnerClip || clips[rounds - 1] !== undefined) return;
    const sentence = game.history[rounds - 1]?.sentence ?? "";
    if (orbis.live !== scene(sentence)) return;
    const id = show.current;
    const index = rounds - 1;
    const timer = setTimeout(async () => {
      const clip = await live.current.record(6);
      if (show.current !== id) return;
      setClips((list) => {
        const next = [...list];
        next[index] = clip;
        return next;
      });
    }, 1_200);
    return () => clearTimeout(timer);
  }, [phase, rounds, orbis.live, winnerClip]);

  const release = () => {
    for (const url of [...cache, ...clips]) if (url) URL.revokeObjectURL(url);
  };

  const start = () => {
    show.current += 1;
    release();
    setGame(newGame(seats, { black: BLACK_CARDS, white: WHITE_CARDS }, target));
    setClips([]);
    setPreview(null);
    setRendering(null);
    setCache([]);
    setWinnerClip(null);
    want(LOBBY_PROMPT);
    if (!orbis.connected) void orbis.open();
  };

  const exit = () => {
    show.current += 1;
    release();
    setGame(null);
    desired.current = "";
    void orbis.close();
  };

  const crownAt = (index: number) => {
    const clip = cache[index] ?? null;
    setRendering(null);
    setWinnerClip(clip);
    if (clip) {
      setClips((list) => {
        const next = [...list];
        next[rounds] = clip;
        return next;
      });
    }
    setGame((current) => (current ? crown(current, index) : current));
  };

  const advance = () => {
    setPreview(null);
    setGame((current) => (current ? nextRound(current, BLACK_CARDS) : current));
  };

  const onPhone = (message: PhoneMessage) => {
    if (message.t === "join") {
      if (game) return;
      const name = message.name.trim().slice(0, 18);
      if (!name) return;
      setSeats((list) =>
        list.some((seat) => seat.id === message.id)
          ? list.map((seat) => (seat.id === message.id ? { ...seat, name } : seat))
          : list.length >= 8
            ? list
            : [...list, { name, bot: false, id: message.id, remote: true }],
      );
      return;
    }
    if (!game) return;
    const judgeId = judgeOf(game).id;
    if (message.t === "play") {
      setGame((current) =>
        current ? play(current, message.id, message.card, message.written) : current,
      );
    } else if (message.t === "look" && game.phase === "judging" && judgeId === message.id) {
      if (game.picks[message.index]) setPreview(message.index);
    } else if (message.t === "crown" && game.phase === "judging" && judgeId === message.id) {
      if (game.picks[message.index]) crownAt(message.index);
    } else if (message.t === "next" && game.phase === "reveal") {
      if (game.players.some((player) => player.id === message.id)) advance();
    }
  };

  const room = useRoom<PhoneMessage>(code, "host", onPhone);

  const publicState = (): PublicState => {
    if (!game) {
      return {
        phase: "lobby",
        black: "",
        target,
        round: 0,
        players: seats.map((seat, index) => ({
          id: seat.id ?? `p${index}`,
          name: seat.name,
          bot: seat.bot,
          remote: Boolean(seat.remote),
          score: 0,
        })),
        judgeId: null,
        waiting: [],
        hands: {},
        answers: [],
        ready: [],
        preview: null,
        winner: null,
        champion: null,
      };
    }
    const winnerPlayer = game.players.find((player) => player.id === game.winner?.playerId);
    const lastRound = game.history[game.history.length - 1];
    return {
      phase: game.phase,
      black: game.black,
      target: game.target,
      round: game.history.length,
      players: game.players.map((player) => ({
        id: player.id,
        name: player.name,
        bot: player.bot,
        remote: player.remote,
        score: player.score,
      })),
      judgeId: judgeOf(game).id,
      waiting: waitingOn(game).map((player) => player.id),
      hands: Object.fromEntries(
        game.players.filter((player) => player.remote).map((player) => [player.id, player.hand]),
      ),
      answers: game.phase === "picking" ? [] : game.picks.map((pick) => pick.card),
      ready: game.picks.map((_, index) => Boolean(cache[index])),
      preview,
      winner:
        winnerPlayer && game.winner && lastRound
          ? { name: winnerPlayer.name, card: game.winner.card, sentence: lastRound.sentence }
          : null,
      champion: champion(game)?.name ?? null,
    };
  };

  useEffect(() => {
    if (room.connected) room.send({ t: "state", state: publicState() });
  }, [room.connected, game, seats, preview, cache, target]);

  if (!game) {
    return (
      <Title
        code={code}
        seats={seats}
        setSeats={setSeats}
        target={target}
        setTarget={setTarget}
        onStart={start}
      />
    );
  }

  const judge = judgeOf(game);
  const winner = game.players.find((player) => player.id === game.winner?.playerId);
  const previewPick = preview === null ? null : game.picks[preview];
  const answer =
    game.phase === "reveal" || game.phase === "over"
      ? game.winner?.card
      : game.phase === "judging"
        ? previewPick?.card
        : (draft ?? undefined);

  const round = game.phase === "reveal" || game.phase === "over" ? rounds : rounds + 1;
  const last = game.history[game.history.length - 1];
  const previewClip = preview === null ? undefined : cache[preview];
  const renderingPick = rendering === null ? null : game.picks[rendering];
  const stageClip =
    game.phase === "judging" && preview !== null
      ? previewClip
        ? previewClip
        : orbis.live === answerPrompt(preview)
          ? null
          : "static"
      : game.phase === "reveal" && orbis.tuning && winnerClip
        ? winnerClip
        : null;
  const caption =
    game.phase === "reveal" && winner && last
      ? { kicker: `★ ${winner.name} wins round ${rounds}`, line: last.sentence }
      : game.phase === "judging" && previewPick && preview !== null
        ? {
            kicker: previewClip
              ? `Replay · answer ${preview + 1} of ${game.picks.length}`
              : `Tuning in · answer ${preview + 1} of ${game.picks.length}`,
            line: fill(game.black, previewPick.card),
          }
        : game.phase === "judging" && renderingPick && rendering !== null
          ? {
              kicker: `Rendering answer ${rendering + 1} of ${game.picks.length}`,
              line: fill(game.black, renderingPick.card),
            }
          : game.phase === "over"
            ? {
                kicker: "Season finale",
                line: `${champion(game)?.name ?? "Someone"} takes the trophy.`,
              }
            : last
              ? { kicker: "Still playing", line: last.sentence }
              : {
                  kicker: "Live from the Orbis studio",
                  line: "Tonight's episode is about to begin.",
                };

  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <header className="bar">
          <Brand />
          <div className="bar-meta">
            <span>Round {Math.max(round, 1)}</span>
            <span className="dot" />
            <span>First to {game.target}</span>
          </div>
          <button className="ghost small" onClick={exit}>
            End show
          </button>
        </header>

        <div className="arena">
          <Stage orbis={orbis} kicker={caption.kicker} line={caption.line} clip={stageClip} />
          <aside className="side">
            <BlackCard text={game.black} answer={answer} />
            <Scoreboard game={game} />
          </aside>
        </div>

        <section className="tray">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${game.phase}-${rounds}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE_OUT } }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.12, ease: EASE_OUT } }}
            >
              {game.phase === "picking" && (
                <Picking
                  game={game}
                  onDraft={setDraft}
                  onPlay={(playerId, card, written) => {
                    setDraft(null);
                    setGame((current) =>
                      current ? play(current, playerId, card, written) : current,
                    );
                  }}
                />
              )}
              {game.phase === "judging" && (
                <Judging
                  game={game}
                  focus={preview}
                  cache={cache}
                  rendering={rendering}
                  onLook={setPreview}
                  onCrown={crownAt}
                />
              )}
              {game.phase === "reveal" && winner && game.winner && (
                <Reveal
                  card={game.winner.card}
                  winner={winner}
                  sentence={last?.sentence ?? ""}
                  final={Boolean(champion(game))}
                  judge={judge}
                  quip={QUIPS[(rounds - 1) % QUIPS.length]}
                  onNext={advance}
                />
              )}
              {game.phase === "over" && (
                <Finale game={game} clips={clips} orbis={orbis} onAgain={start} />
              )}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
    </MotionConfig>
  );
}

function burst() {
  const colors = ["#ffd36b", "#ff5a4e", "#ffffff", "#ffb547"];
  void confetti({
    particleCount: 140,
    spread: 80,
    startVelocity: 48,
    origin: { x: 0.35, y: 0.55 },
    colors,
  });
  setTimeout(() => {
    void confetti({
      particleCount: 90,
      spread: 110,
      startVelocity: 38,
      origin: { x: 0.65, y: 0.5 },
      colors,
    });
  }, 180);
}

function Orbit({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="orbit">
      <circle cx="16" cy="16" r="7" fill="currentColor" />
      <ellipse
        cx="16"
        cy="16"
        rx="14.5"
        ry="5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        transform="rotate(-24 16 16)"
      />
    </svg>
  );
}

function Brand() {
  return (
    <div className="brand">
      <Orbit />
      <span>
        Cards Against <em>Orbis</em>
      </span>
    </div>
  );
}

function Title({
  code,
  seats,
  setSeats,
  target,
  setTarget,
  onStart,
}: {
  code: string | null;
  seats: Seat[];
  setSeats: (seats: Seat[]) => void;
  target: number;
  setTarget: (target: number) => void;
  onStart: () => void;
}) {
  const [name, setName] = useState("");
  const add = (seat: Seat) => {
    if (!seat.name.trim() || seats.length >= 8) return;
    setSeats([...seats, { ...seat, name: seat.name.trim().slice(0, 18) }]);
  };
  const nextBot = BOT_NAMES.find((bot) => !seats.some((seat) => seat.name === bot));
  const [qr, setQr] = useState("");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const joinUrl = code && origin ? `${origin}/play/${code}` : "";
  useEffect(() => {
    if (!joinUrl) return;
    void QRCode.toDataURL(joinUrl, {
      margin: 1,
      width: 240,
      color: { dark: "#09080a", light: "#f7f4ec" },
    }).then(setQr);
  }, [joinUrl]);

  return (
    <main className="title">
      <div className="title-glow" aria-hidden />
      <section className="title-copy">
        <motion.p
          className="eyebrow"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
        >
          <Orbit size={16} /> A live-video party game
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE_OUT }}
        >
          Cards Against <em>Orbis</em>
        </motion.h1>
        <motion.p
          className="lede"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.4, ease: EASE_OUT }}
        >
          Fill in the blank. Then the TV tunes in to <b>every answer as live AI video</b>, generated
          in real time by Orbis and steered by your worst ideas.
        </motion.p>
        <ol className="steps">
          <li>
            <span>1</span>
            <p>The judge reads a black card.</p>
          </li>
          <li>
            <span>2</span>
            <p>Everyone else plays a white card. Pass the screen.</p>
          </li>
          <li>
            <span>3</span>
            <p>
              The TV plays every answer <b>live</b>. The judge flips between them and crowns one.
            </p>
          </li>
        </ol>
        <div className="hero-cards" aria-hidden>
          <motion.div
            className="card black hero-black"
            initial={{ rotate: -12, y: 24, opacity: 0 }}
            animate={{ rotate: -8, y: 0, opacity: 1 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0.2, delay: 0.12 }}
          >
            <p>
              Live on the evening news: <span className="blank" /> has taken over the city.
            </p>
            <CardFoot />
          </motion.div>
          <motion.div
            className="card white hero-white"
            initial={{ rotate: 14, y: 32, opacity: 0 }}
            animate={{ rotate: 7, y: 0, opacity: 1 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0.2, delay: 0.2 }}
          >
            <p>A herd of tiny, furious goats.</p>
            <CardFoot />
          </motion.div>
        </div>
      </section>

      <motion.form
        className="setup"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4, ease: EASE_OUT }}
        onSubmit={(event) => {
          event.preventDefault();
          add({ name, bot: false });
          setName("");
        }}
      >
        <h2>Who&apos;s playing?</h2>
        {joinUrl && (
          <div className="join">
            {qr && <img src={qr} alt={`QR code to join room ${code}`} width={104} height={104} />}
            <div>
              <p className="eyebrow">Play from your phone</p>
              <p className="join-code">{code}</p>
              <p className="fine join-url">{joinUrl.replace(/^https?:\/\//, "")}</p>
            </div>
          </div>
        )}
        <div className="seats">
          <AnimatePresence initial={false}>
            {seats.map((seat, index) => (
              <motion.span
                key={seat.id ?? seat.name}
                className="seat"
                layout
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.12 } }}
                transition={SPRING}
              >
                <Avatar name={seat.name} index={index} bot={seat.bot} />
                {seat.name}
                {seat.remote && <span aria-label="on a phone">📱</span>}
                <button
                  type="button"
                  aria-label={`Remove ${seat.name}`}
                  onClick={() => setSeats(seats.filter((item) => item !== seat))}
                >
                  ×
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
          {seats.length === 0 && <span className="seats-empty">No one yet. Add 3 or more.</span>}
        </div>
        <div className="add-row">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Type a name, press Enter"
            maxLength={18}
            aria-label="Player name"
          />
          <button className="ghost" type="submit" disabled={!name.trim()}>
            Add
          </button>
        </div>
        <button
          className="ghost bot-add"
          type="button"
          disabled={!nextBot || seats.length >= 8}
          onClick={() => nextBot && add({ name: nextBot, bot: true })}
        >
          🤖 Add a bot player
        </button>

        <h3>Play to</h3>
        <div className="segmented" role="radiogroup" aria-label="Points to win">
          {TARGETS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={target === value}
              className={target === value ? "on" : ""}
              onClick={() => setTarget(value)}
            >
              {value} pts
            </button>
          ))}
        </div>

        <button className="primary big" type="button" disabled={seats.length < 3} onClick={onStart}>
          Open the studio <span aria-hidden>→</span>
        </button>
        <p className="fine">
          {seats.length < 3
            ? `Add ${3 - seats.length} more player${3 - seats.length === 1 ? "" : "s"}. Bots count. Playing alone? Add two bots.`
            : "One screen for everyone. Orbis warms up while you play the first cards."}
        </p>
      </motion.form>
    </main>
  );
}

function Stage({
  orbis,
  kicker,
  line,
  clip,
}: {
  orbis: OrbisSession;
  kicker: string;
  line: string;
  clip: string | null | undefined;
}) {
  const [elapsed, setElapsed] = useState(0);
  const steering = clip === "static" || (!clip && orbis.tuning);
  useEffect(() => {
    if (orbis.onAir) return;
    const begin = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - begin) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [orbis.onAir]);

  const label = orbis.retrying
    ? "Waiting for a free studio"
    : orbis.status === "ready"
      ? "Rolling the first frames"
      : orbis.status === "waiting"
        ? "Booting a live video model for you"
        : orbis.status === "connecting"
          ? "Calling the studio"
          : elapsed < 4
            ? "Calling the studio"
            : "Studio is dark";

  return (
    <div className="stage">
      <div className="ambient" aria-hidden>
        {orbis.connected && (
          <div className="feed">
            <ReactorView track="main_video" muted videoObjectFit="cover" />
          </div>
        )}
      </div>
      <div className="screen">
        {orbis.connected && (
          <div className="feed">
            <Tube tuning={orbis.tuning}>
              <ReactorView
                track="main_video"
                audioTrack="main_audio"
                muted={orbis.muted}
                videoObjectFit="cover"
              />
            </Tube>
          </div>
        )}
        {clip === "static" && <div className="feed no-signal" />}
        {clip && clip !== "static" && (
          <div className="feed" key={clip}>
            <Tube tuning={false}>
              <video src={clip} autoPlay muted loop playsInline />
            </Tube>
          </div>
        )}
        <AnimatePresence>
          {!orbis.onAir && (
            <motion.div
              className="warmup"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.4, ease: EASE_OUT } }}
            >
              <div className="orb" aria-hidden>
                <span />
                <span />
                <span />
              </div>
              <p className="warmup-title">{label}…</p>
              <p className="warmup-sub">
                Orbis spins up a real-time video model just for this table. The first boot can take
                a minute or two, so start playing cards now.
              </p>
              {orbis.status === "disconnected" && !orbis.retrying && elapsed >= 4 ? (
                <button className="primary" onClick={() => void orbis.open()}>
                  Reconnect the studio
                </button>
              ) : (
                <p className="warmup-time">
                  {orbis.status} · {elapsed}s
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <div className={`onair ${orbis.onAir ? "live" : ""}`}>
          <span />
          {orbis.onAir ? "On air" : "Standby"}
        </div>
        <AnimatePresence>
          {orbis.onAir && steering && (
            <motion.div
              className="steering"
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0, transition: { duration: 0.18, ease: EASE_OUT } }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
            >
              <i /> Changing the channel
            </motion.div>
          )}
        </AnimatePresence>
        <button className="sound" onClick={orbis.toggleMuted} aria-label="Toggle sound">
          {orbis.muted ? "🔇 Sound off" : "🔊 Sound on"}
        </button>
        <AnimatePresence mode="wait">
          {orbis.onAir && (
            <motion.div
              key={kicker + line}
              className="chyron"
              initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: 4, transition: { duration: 0.12 } }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
            >
              <span className="kicker">{kicker}</span>
              <span className="line">{line}</span>
            </motion.div>
          )}
        </AnimatePresence>
        {orbis.error && <div className="toast">{orbis.error}</div>}
      </div>
    </div>
  );
}

function CardFoot() {
  return (
    <span className="card-foot">
      <Orbit size={14} /> Cards Against Orbis
    </span>
  );
}

function BlackCard({ text, answer }: { text: string; answer?: string }) {
  const [before, word, after] = parts(text, answer ?? "");
  return (
    <motion.div
      key={text}
      className="card black side-black"
      initial={{ rotateY: -35, opacity: 0, scale: 0.97 }}
      animate={{ rotateY: 0, opacity: 1, scale: 1 }}
      transition={SPRING}
    >
      <p>
        {answer ? (
          <>
            {before}
            <AnimatePresence mode="wait">
              <motion.mark
                key={word}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.18, ease: EASE_OUT } }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
              >
                {word}
              </motion.mark>
            </AnimatePresence>
            {after}
          </>
        ) : (
          renderBlank(text)
        )}
      </p>
      <CardFoot />
    </motion.div>
  );
}

function renderBlank(text: string): ReactNode {
  if (!text.includes("____")) return text;
  const [before, after] = text.split("____");
  return (
    <>
      {before}
      <span className="blank" />
      {after}
    </>
  );
}

function Avatar({ name, index, bot }: { name: string; index: number; bot: boolean }) {
  return (
    <span className="avatar" style={{ background: COLORS[index % COLORS.length] }}>
      {bot ? "🤖" : name.charAt(0).toUpperCase()}
    </span>
  );
}

function Scoreboard({ game }: { game: GameState }) {
  const judge = judgeOf(game);
  const waiting = waitingOn(game);
  return (
    <ul className="scores">
      {game.players.map((player, index) => {
        const isJudge = player.id === judge.id;
        const status = isJudge
          ? "Judge"
          : game.phase === "picking"
            ? waiting.some((item) => item.id === player.id)
              ? "Picking…"
              : "Played ✓"
            : player.bot
              ? "Bot"
              : "";
        return (
          <motion.li key={player.id} layout className={isJudge ? "judge" : ""}>
            <Avatar name={player.name} index={index} bot={player.bot} />
            <span className="who">
              <b>{player.name}</b>
              <small>{status}</small>
            </span>
            <span className="pips" aria-label={`${player.score} points`}>
              {Array.from({ length: game.target }, (_, pip) => (
                <motion.i
                  key={pip}
                  className={pip < player.score ? "on" : ""}
                  animate={pip < player.score ? { scale: [1, 1.6, 1] } : { scale: 1 }}
                />
              ))}
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
}

function Picking({
  game,
  onDraft,
  onPlay,
}: {
  game: GameState;
  onDraft: (text: string | null) => void;
  onPlay: (playerId: string, card: string, written: string) => void;
}) {
  const [shown, setShown] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [written, setWritten] = useState("");
  const waiting = waitingOn(game);
  const player = waiting.find((item) => !item.remote);
  const phones = waiting.filter((item) => item.remote);
  const judge = judgeOf(game);
  const humans = game.players.filter((item) => !item.bot && !item.remote).length;
  const gated = humans > 1 && shown !== player?.id;
  const card = selected === null || !player ? null : player.hand[selected];
  const answer = card === BLANK ? written : card;
  const ready = Boolean(card && answer?.trim());

  useEffect(() => {
    onDraft(!gated && ready && answer ? answer : null);
  }, [gated, ready, answer]);

  if (!player) {
    return (
      <div className="gate">
        <div className="gate-card">
          <p className="eyebrow">📱 Phones are picking</p>
          <h2>
            Waiting for <em>{phones.map((item) => item.name).join(", ")}</em>
          </h2>
          <p>Play your card on your phone. {judge.name} is judging this round.</p>
        </div>
      </div>
    );
  }

  if (gated) {
    return (
      <div className="gate">
        <motion.div
          className="gate-card"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={SPRING}
        >
          <p className="eyebrow">Pass the screen</p>
          <h2>
            <em>{player.name}</em>, you&apos;re up.
          </h2>
          <p>Everyone else, look away. {judge.name} is judging this round.</p>
          <button
            className="primary big"
            onClick={() => {
              setShown(player.id);
              setSelected(null);
              setWritten("");
            }}
          >
            I&apos;m {player.name}. Show my cards
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="picking">
      <div className="tray-head">
        <p>
          <b>{player.name}</b>, pick the card that makes the best scene.
          <span className="muted"> {judge.name} is the judge.</span>
        </p>
        <div className="play-row">
          <button
            className="primary"
            disabled={!ready}
            onClick={() => card && onPlay(player.id, card, written)}
          >
            Play this card
          </button>
        </div>
      </div>
      <div className="hand">
        {player.hand.map((item, index) => {
          const middle = (player.hand.length - 1) / 2;
          const offset = index - middle;
          const active = selected === index;
          return (
            <motion.div
              key={`${player.id}-${index}-${item}`}
              role="button"
              tabIndex={0}
              className={`card white in-hand ${active ? "active" : ""} ${item === BLANK ? "blank-card" : ""}`}
              style={{ zIndex: active ? 20 : index }}
              initial={{ y: 40, opacity: 0, rotate: 0 }}
              animate={{
                y: active ? -34 : Math.abs(offset) * 5,
                rotate: active ? 0 : offset * 2.6,
                opacity: 1,
              }}
              whileHover={{ y: active ? -34 : -18, rotate: 0 }}
              transition={{ ...SPRING, delay: index * 0.03 }}
              onClick={() => setSelected(index)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                setSelected(index);
              }}
            >
              {item === BLANK ? (
                active ? (
                  <textarea
                    autoFocus
                    value={written}
                    maxLength={80}
                    placeholder="Write anything. It becomes video."
                    onChange={(event) => setWritten(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  />
                ) : (
                  <p>
                    <span className="pen">✎</span> Write your own card
                  </p>
                )
              ) : (
                <p>{item}</p>
              )}
              <CardFoot />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function Judging({
  game,
  focus,
  cache,
  rendering,
  onLook,
  onCrown,
}: {
  game: GameState;
  focus: number | null;
  cache: (string | null | undefined)[];
  rendering: number | null;
  onLook: (index: number) => void;
  onCrown: (index: number) => void;
}) {
  const judge = judgeOf(game);
  const [seen, setSeen] = useState<number[]>([]);
  const driven = judge.bot || judge.remote;
  useEffect(() => {
    if (focus !== null) setSeen((list) => (list.includes(focus) ? list : [...list, focus]));
  }, [focus]);
  const choice = useRef(Math.floor(Math.random() * game.picks.length));
  const look = (index: number) => {
    setSeen((list) => (list.includes(index) ? list : [...list, index]));
    onLook(index);
  };

  useEffect(() => {
    if (!judge.bot) return;
    const next = game.picks.findIndex((_, index) => !seen.includes(index));
    if (next === -1) {
      const again = setTimeout(() => look(choice.current), 5_000);
      const decide = setTimeout(() => onCrown(choice.current), 10_000);
      return () => {
        clearTimeout(again);
        clearTimeout(decide);
      };
    }
    const ready = cache[next] !== undefined;
    const timer = setTimeout(() => look(next), ready ? (seen.length ? 6_000 : 800) : 30_000);
    return () => clearTimeout(timer);
  }, [seen, cache[game.picks.findIndex((_, index) => !seen.includes(index))] !== undefined]);

  return (
    <div className="judging">
      <div className="tray-head">
        <p>
          {judge.remote ? (
            <>
              📱 <b>{judge.name}</b> is judging from their phone. Watch the TV.
            </>
          ) : judge.bot ? (
            <>
              <b>{judge.name}</b> is watching every answer on TV…
            </>
          ) : (
            <>
              <b>{judge.name}</b>, tap a card to watch it. Ready cards replay instantly. Then crown
              the best.
            </>
          )}
        </p>
        <span className="muted">
          {seen.length}/{game.picks.length} previewed
        </span>
      </div>
      <div className="answers">
        {game.picks.map((pick, index) => {
          const open = seen.includes(index);
          const live = focus === index;
          return (
            <motion.div
              key={`${pick.playerId}-${index}`}
              className={`answer ${live ? "live" : ""}`}
              initial={{ y: 32, opacity: 0 }}
              animate={{ y: live ? -12 : 0, opacity: 1 }}
              transition={{ ...SPRING, delay: index * 0.04 }}
            >
              <motion.div
                className="flip"
                role="button"
                tabIndex={0}
                aria-label={open ? pick.card : `Answer ${index + 1}, face down`}
                initial={{ rotateY: 180 }}
                animate={{ rotateY: open ? 0 : 180 }}
                transition={{ type: "spring", duration: 0.38, bounce: 0.1 }}
                onClick={() => !driven && look(index)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  if (!driven) look(index);
                }}
              >
                <div className="card white face">
                  <p>{pick.card}</p>
                  <CardFoot />
                </div>
                <div className="card white back">
                  <Orbit size={36} />
                  <span>
                    Cards
                    <br />
                    Against
                    <br />
                    <em>Orbis</em>
                  </span>
                </div>
              </motion.div>
              {live && <span className="live-tag">● On screen</span>}
              <span
                className={`cache-tag ${cache[index] ? "ready" : rendering === index ? "busy" : ""}`}
              >
                {cache[index]
                  ? "● Ready"
                  : rendering === index
                    ? "Rendering…"
                    : cache[index] === null
                      ? "Live only"
                      : "Queued"}
              </span>
              {!driven && open && (
                <motion.button
                  className="crown"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.18, ease: EASE_OUT } }}
                  onClick={() => onCrown(index)}
                >
                  👑 Crown
                </motion.button>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function Reveal({
  card,
  winner,
  sentence,
  final,
  judge,
  quip,
  onNext,
}: {
  card: string;
  winner: Player;
  sentence: string;
  final: boolean;
  judge: Player;
  quip: string;
  onNext: () => void;
}) {
  return (
    <div className="reveal">
      <motion.div
        className="card white winner-card"
        initial={{ scale: 0.85, rotate: -10, y: 24, opacity: 0 }}
        animate={{ scale: 1, rotate: -3, y: 0, opacity: 1 }}
        transition={{ type: "spring", duration: 0.5, bounce: 0.35 }}
      >
        <span className="crown-badge">👑</span>
        <p>{card}</p>
        <CardFoot />
      </motion.div>
      <div className="reveal-copy">
        <p className="eyebrow">{judge.name} crowned</p>
        <motion.h2
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.25, ease: EASE_OUT }}
        >
          <em>{winner.name}</em> takes the round
        </motion.h2>
        <p className="sentence">“{sentence}”</p>
        <p className="muted">{quip} This world keeps running until the next winner.</p>
        <button className="primary big" onClick={onNext}>
          {final ? "Crown the champion" : "Next round"} <span aria-hidden>→</span>
        </button>
      </div>
    </div>
  );
}

function Finale({
  game,
  clips,
  orbis,
  onAgain,
}: {
  game: GameState;
  clips: (string | null)[];
  orbis: OrbisSession;
  onAgain: () => void;
}) {
  const winner = champion(game);
  const [saving, setSaving] = useState(false);
  const ranking = [...game.players].sort((a, b) => b.score - a.score);
  return (
    <div className="finale">
      <div className="finale-head">
        <div>
          <p className="eyebrow">Season finale</p>
          <h2>
            🏆 <em>{winner?.name}</em> wins the show
          </h2>
          <p className="muted">
            {ranking.map((player) => `${player.name} ${player.score}`).join(" · ")}
          </p>
        </div>
        <div className="finale-actions">
          <button
            className="ghost"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await orbis.saveEpisode();
              setSaving(false);
            }}
          >
            {saving ? "Cutting the episode…" : "⬇ Save the full episode"}
          </button>
          <button className="primary" onClick={onAgain}>
            Play again
          </button>
        </div>
      </div>
      <p className="reel-title">The reel: your game as one strange movie</p>
      <div className="reel">
        {game.history.map((round, index) => {
          const player = game.players.find((item) => item.id === round.winnerId);
          const clip = clips[index];
          return (
            <motion.figure
              key={index}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.3, ease: EASE_OUT }}
            >
              <div className="reel-shot">
                {clip ? (
                  <Tube width={480} tuning={false}>
                    <video src={clip} autoPlay muted loop playsInline />
                  </Tube>
                ) : (
                  <span className="reel-still">
                    <Orbit size={28} />
                  </span>
                )}
                <span className="reel-num">{String(index + 1).padStart(2, "0")}</span>
              </div>
              <figcaption>
                <b>{player?.name}</b>
                <span>“{round.sentence}”</span>
              </figcaption>
            </motion.figure>
          );
        })}
      </div>
    </div>
  );
}
