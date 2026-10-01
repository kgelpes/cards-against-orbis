"use client";

import { type Clip, ClipPlayer, ReactorView } from "@reactor-team/js-sdk";
import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

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
const COLORS = ["#ff5a4e", "#ffb547", "#5ad1ff", "#9b7bff", "#4fe0a6", "#ff7ac3", "#ffe27a", "#8fb3ff"];
const SPRING = { type: "spring", stiffness: 320, damping: 26 } as const;

export function Game({ orbis }: { orbis: OrbisSession }) {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [target, setTarget] = useState(3);
  const [game, setGame] = useState<GameState | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [clips, setClips] = useState<(Clip | null)[]>([]);
  const desired = useRef("");
  const show = useRef(0);
  const live = useRef(orbis);
  live.current = orbis;
  const pending = useRef<{ index: number; at: number; timer: ReturnType<typeof setTimeout> } | null>(
    null,
  );

  const want = (prompt: string) => {
    if (desired.current === prompt) return;
    desired.current = prompt;
    if (live.current.connected) live.current.show(prompt);
  };

  const takeClip = () => {
    const shot = pending.current;
    if (!shot) return;
    pending.current = null;
    clearTimeout(shot.timer);
    const id = show.current;
    const seconds = Math.min(10, Math.max(4, Math.round((Date.now() - shot.at) / 1000)));
    void live.current.clip(seconds).then((clip) => {
      if (show.current !== id) return;
      setClips((list) => {
        const next = [...list];
        next[shot.index] = clip;
        return next;
      });
    });
  };

  useEffect(() => {
    if (orbis.connected && desired.current) orbis.show(desired.current);
  }, [orbis.connected]);

  const phase = game?.phase;
  const rounds = game?.history.length ?? 0;
  useEffect(() => {
    if (!game) return;
    if (game.phase === "reveal") {
      const round = game.history[game.history.length - 1];
      want(scene(round.sentence));
      burst();
      pending.current = {
        index: game.history.length - 1,
        at: Date.now(),
        timer: setTimeout(takeClip, 12_000),
      };
    }
    if (game.phase === "over") want(FINALE_PROMPT);
  }, [phase, rounds]);

  const start = () => {
    show.current += 1;
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
    setGame(newGame(seats, { black: BLACK_CARDS, white: WHITE_CARDS }, target));
    setClips([]);
    setPreview(null);
    want(LOBBY_PROMPT);
    if (!orbis.connected) void orbis.open();
  };

  const exit = () => {
    show.current += 1;
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
    setGame(null);
    desired.current = "";
    void orbis.close();
  };

  if (!game) {
    return (
      <Title
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
  const caption =
    game.phase === "reveal" && winner && last
      ? { kicker: `★ ${winner.name} wins round ${rounds}`, line: last.sentence }
      : game.phase === "judging" && previewPick && preview !== null
        ? {
            kicker: `Live preview · answer ${preview + 1} of ${game.picks.length}`,
            line: fill(game.black, previewPick.card),
          }
        : game.phase === "over"
          ? { kicker: "Season finale", line: `${champion(game)?.name ?? "Someone"} takes the trophy.` }
          : last
            ? { kicker: "Still playing", line: last.sentence }
            : { kicker: "Live from the Orbis studio", line: "Tonight's episode is about to begin." };

  return (
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
        <Stage orbis={orbis} kicker={caption.kicker} line={caption.line} />
        <aside className="side">
          <BlackCard text={game.black} answer={answer} />
          <Scoreboard game={game} />
        </aside>
      </div>

      <section className="tray">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${game.phase}-${rounds}`}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {game.phase === "picking" && (
              <Picking
                game={game}
                onDraft={setDraft}
                onPlay={(playerId, card, written) => {
                  setDraft(null);
                  setGame((current) => (current ? play(current, playerId, card, written) : current));
                }}
              />
            )}
            {game.phase === "judging" && (
              <Judging
                game={game}
                focus={preview}
                onLook={(index) => {
                  setPreview(index);
                  want(scene(fill(game.black, game.picks[index].card)));
                }}
                onCrown={(index) => setGame((current) => (current ? crown(current, index) : current))}
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
                onNext={() => {
                  takeClip();
                  setPreview(null);
                  setGame((current) => (current ? nextRound(current, BLACK_CARDS) : current));
                }}
              />
            )}
            {game.phase === "over" && (
              <Finale game={game} clips={clips} orbis={orbis} onAgain={start} />
            )}
          </motion.div>
        </AnimatePresence>
      </section>
    </div>
  );
}

function burst() {
  const colors = ["#ffd36b", "#ff5a4e", "#ffffff", "#ffb547"];
  void confetti({ particleCount: 140, spread: 80, startVelocity: 48, origin: { x: 0.35, y: 0.55 }, colors });
  setTimeout(() => {
    void confetti({ particleCount: 90, spread: 110, startVelocity: 38, origin: { x: 0.65, y: 0.5 }, colors });
  }, 180);
}

function Orbit({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="orbit">
      <circle cx="16" cy="16" r="7" fill="currentColor" />
      <ellipse cx="16" cy="16" rx="14.5" ry="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" transform="rotate(-24 16 16)" />
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
  seats,
  setSeats,
  target,
  setTarget,
  onStart,
}: {
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

  return (
    <main className="title">
      <div className="title-glow" aria-hidden />
      <section className="title-copy">
        <motion.p className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Orbit size={16} /> A live-video party game
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
        >
          Cards Against <em>Orbis</em>
        </motion.h1>
        <motion.p
          className="lede"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6 }}
        >
          Fill in the blank. Then watch the winning card <b>come to life</b> as live AI video,
          streamed in real time by Orbis. One world, one screen, steered by your worst ideas.
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
              The judge flips each answer and sees it <b>live on screen</b>, then crowns one.
            </p>
          </li>
        </ol>
        <div className="hero-cards" aria-hidden>
          <motion.div
            className="card black hero-black"
            initial={{ rotate: -14, y: 40, opacity: 0 }}
            animate={{ rotate: -8, y: 0, opacity: 1 }}
            transition={{ ...SPRING, delay: 0.25 }}
          >
            <p>
              Live on the evening news: <span className="blank" /> has taken over the city.
            </p>
            <CardFoot />
          </motion.div>
          <motion.div
            className="card white hero-white"
            initial={{ rotate: 18, y: 60, opacity: 0 }}
            animate={{ rotate: 7, y: 0, opacity: 1 }}
            transition={{ ...SPRING, delay: 0.4 }}
          >
            <p>A herd of tiny, furious goats.</p>
            <CardFoot />
          </motion.div>
        </div>
      </section>

      <motion.form
        className="setup"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
        onSubmit={(event) => {
          event.preventDefault();
          add({ name, bot: false });
          setName("");
        }}
      >
        <h2>Who&apos;s playing?</h2>
        <div className="seats">
          <AnimatePresence initial={false}>
            {seats.map((seat, index) => (
              <motion.span
                key={seat.name}
                className="seat"
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <Avatar name={seat.name} index={index} bot={seat.bot} />
                {seat.name}
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

        <button
          className="primary big"
          type="button"
          disabled={seats.length < 3}
          onClick={onStart}
        >
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

function Stage({ orbis, kicker, line }: { orbis: OrbisSession; kicker: string; line: string }) {
  const [elapsed, setElapsed] = useState(0);
  const [steering, setSteering] = useState(false);
  useEffect(() => {
    if (!orbis.showing) return;
    setSteering(true);
    const timer = setTimeout(() => setSteering(false), 7000);
    return () => clearTimeout(timer);
  }, [orbis.showing]);
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
            <ReactorView
              track="main_video"
              audioTrack="main_audio"
              muted={orbis.muted}
              videoObjectFit="cover"
            />
          </div>
        )}
        <AnimatePresence>
          {!orbis.onAir && (
            <motion.div
              className="warmup"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 1.2 } }}
            >
              <div className="orb" aria-hidden>
                <span />
                <span />
                <span />
              </div>
              <p className="warmup-title">{label}…</p>
              <p className="warmup-sub">
                Orbis spins up a real-time video model just for this table. The first boot can take a
                minute or two, so start playing cards now.
              </p>
              {orbis.status === "disconnected" && !orbis.retrying ? (
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
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
            >
              <i /> Steering the scene
            </motion.div>
          )}
        </AnimatePresence>
        <button className="sound" onClick={orbis.toggleMuted} aria-label="Toggle sound">
          {orbis.muted ? "🔇 Sound off" : "🔊 Sound on"}
        </button>
        <AnimatePresence mode="wait">
          <motion.div
            key={kicker + line}
            className="chyron"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <span className="kicker">{kicker}</span>
            <span className="line">{line}</span>
          </motion.div>
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
      initial={{ rotateY: -90, opacity: 0 }}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={SPRING}
    >
      <p>
        {answer ? (
          <>
            {before}
            <AnimatePresence mode="wait">
              <motion.mark
                key={word}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
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
  const player = waitingOn(game)[0];
  const judge = judgeOf(game);
  const humans = game.players.filter((item) => !item.bot).length;
  const gated = humans > 1 && shown !== player?.id;
  const card = selected === null || !player ? null : player.hand[selected];
  const answer = card === BLANK ? written : card;
  const ready = Boolean(card && answer?.trim());

  useEffect(() => {
    onDraft(!gated && ready && answer ? answer : null);
  }, [gated, ready, answer]);

  if (!player) return null;

  if (gated) {
    return (
      <div className="gate">
        <motion.div
          className="gate-card"
          initial={{ rotate: -3, scale: 0.94 }}
          animate={{ rotate: 0, scale: 1 }}
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
              initial={{ y: 120, opacity: 0, rotate: 0 }}
              animate={{
                y: active ? -34 : Math.abs(offset) * 5,
                rotate: active ? 0 : offset * 2.6,
                opacity: 1,
              }}
              whileHover={{ y: active ? -34 : -18, rotate: 0 }}
              transition={{ ...SPRING, delay: index * 0.035 }}
              onClick={() => setSelected(index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") setSelected(index);
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
  onLook,
  onCrown,
}: {
  game: GameState;
  focus: number | null;
  onLook: (index: number) => void;
  onCrown: (index: number) => void;
}) {
  const judge = judgeOf(game);
  const [seen, setSeen] = useState<number[]>([]);
  const look = (index: number) => {
    setSeen((list) => (list.includes(index) ? list : [...list, index]));
    onLook(index);
  };

  useEffect(() => {
    if (!judge.bot) return;
    const step = 10_000;
    const timers = game.picks.map((_, index) => setTimeout(() => look(index), 900 + index * step));
    const pick = Math.floor(Math.random() * game.picks.length);
    timers.push(setTimeout(() => look(pick), 900 + game.picks.length * step));
    timers.push(setTimeout(() => onCrown(pick), 900 + game.picks.length * step + 4500));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="judging">
      <div className="tray-head">
        <p>
          {judge.bot ? (
            <>
              <b>{judge.name}</b> is watching every answer play out live…
            </>
          ) : (
            <>
              <b>{judge.name}</b>, tap each card to see it <b>live on screen</b>. Then crown the best.
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
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: live ? -14 : 0, opacity: 1 }}
              transition={{ ...SPRING, delay: index * 0.06 }}
            >
              <motion.div
                className="flip"
                role="button"
                tabIndex={0}
                aria-label={open ? pick.card : `Answer ${index + 1}, face down`}
                animate={{ rotateY: open ? 0 : 180 }}
                transition={{ type: "spring", stiffness: 180, damping: 20 }}
                onClick={() => !judge.bot && look(index)}
                onKeyDown={(event) => {
                  if (!judge.bot && (event.key === "Enter" || event.key === " ")) look(index);
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
              {live && <span className="live-tag">● Live</span>}
              {!judge.bot && open && (
                <motion.button
                  className="crown"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
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
        initial={{ scale: 0.6, rotate: -12, y: 60 }}
        animate={{ scale: 1, rotate: -3, y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 14 }}
      >
        <span className="crown-badge">👑</span>
        <p>{card}</p>
        <CardFoot />
      </motion.div>
      <div className="reveal-copy">
        <p className="eyebrow">{judge.name} crowned</p>
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
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
  clips: (Clip | null)[];
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
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
            >
              <div className="reel-shot">
                {clip ? (
                  <ClipPlayer clip={clip} muted autoPlay />
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
