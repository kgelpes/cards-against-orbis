"use client";

import { motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

import { BLANK, parts } from "@/lib/game";
import { type HostMessage, type PhoneMessage, type PublicState, useRoom } from "@/lib/room";

const SPRING = { type: "spring", duration: 0.3, bounce: 0.12 } as const;

type Send = (message: PhoneMessage) => void;
type Props = { state: PublicState; id: string; send: Send };

function newId() {
  return (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)).slice(0, 8);
}

export function Phone({ code }: { code: string }) {
  const room = code.toUpperCase();
  const key = `cao-${room}`;
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<PublicState | null>(null);

  useEffect(() => {
    try {
      const saved: { id?: string; name?: string } | null = JSON.parse(
        sessionStorage.getItem(key) ?? "null",
      );
      if (saved?.id) setId(saved.id);
      if (saved?.name) setName(saved.name);
    } catch {
      return;
    }
  }, [key]);

  const { connected, send } = useRoom<HostMessage | PhoneMessage>(
    name ? room : null,
    "phone",
    (message) => {
      if (message.t !== "state") return;
      setState(message.state);
      if (message.state.phase === "lobby" && !message.state.players.some((p) => p.id === id)) {
        send({ t: "join", id, name });
      }
    },
  );

  useEffect(() => {
    if (connected && id && name) send({ t: "join", id, name });
  }, [connected]);

  const join = () => {
    const nextId = id || newId();
    const nextName = draft.trim().slice(0, 18);
    if (!nextName) return;
    setId(nextId);
    setName(nextName);
    try {
      sessionStorage.setItem(key, JSON.stringify({ id: nextId, name: nextName }));
    } catch {
      return;
    }
  };

  const me = state?.players.find((p) => p.id === id);
  let screen: ReactNode;
  let screenKey: string;

  if (!name) {
    screenKey = "join";
    screen = (
      <form
        className="phone-join"
        onSubmit={(event) => {
          event.preventDefault();
          join();
        }}
      >
        <h1>Join room {room}</h1>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Your name"
          aria-label="Your name"
          maxLength={18}
          autoComplete="nickname"
          autoFocus
        />
        <button type="submit" className="primary big" disabled={!draft.trim()}>
          Join
        </button>
      </form>
    );
  } else if (!state || !connected) {
    screenKey = "connecting";
    screen = <h1 className="muted">Connecting to the studio…</h1>;
  } else if (state.phase === "lobby") {
    screenKey = "lobby";
    screen = (
      <>
        <h1>You&apos;re in, {name}!</h1>
        <p className="muted">Watch the TV. The host starts the game.</p>
        <ul className="phone-list">
          {state.players.map((p) => (
            <li key={p.id} className={p.id === id ? "me" : undefined}>
              {p.name}
            </li>
          ))}
        </ul>
      </>
    );
  } else if (!me) {
    screenKey = "late";
    screen = <h1>This game already started. Join the next one.</h1>;
  } else if (state.phase === "picking") {
    screenKey = `picking-${state.round}`;
    screen = <Picking key={state.round} state={state} id={id} send={send} />;
  } else if (state.phase === "judging") {
    screenKey = `judging-${state.round}`;
    screen = <Judging state={state} id={id} send={send} />;
  } else if (state.phase === "reveal") {
    screenKey = `reveal-${state.round}`;
    screen = (
      <>
        <p className="eyebrow">Round {state.round}</p>
        <h1>{state.winner?.name} takes the round</h1>
        <p className="phone-sentence">{state.winner?.sentence}</p>
        <div className="phone-dock">
          <button type="button" className="primary big" onClick={() => send({ t: "next", id })}>
            {state.champion ? "Crown the champion" : "Next round"}
          </button>
        </div>
      </>
    );
  } else {
    screenKey = "over";
    screen = (
      <>
        <h1>🏆 {state.champion} wins the show</h1>
        <ol className="phone-list">
          {[...state.players]
            .sort((a, b) => b.score - a.score)
            .map((p) => (
              <li key={p.id} className={p.id === id ? "me" : undefined}>
                <span>{p.name}</span>
                <b>{p.score}</b>
              </li>
            ))}
        </ol>
      </>
    );
  }

  return (
    <main className="phone">
      <header className="phone-bar">
        <span className="phone-brand">
          <Orbit size={16} /> Cards Against Orbis
        </span>
        <span className="phone-me">
          <i className={connected ? "phone-dot on" : "phone-dot"} aria-label={connected ? "Connected" : "Reconnecting"} />
          {name && (
            <>
              {name} · {me?.score ?? 0}
            </>
          )}
        </span>
      </header>
      <motion.section
        key={screenKey}
        className="phone-body"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
      >
        {screen}
      </motion.section>
    </main>
  );
}

function Picking({ state, id, send }: Props) {
  const [pick, setPick] = useState<number | null>(null);
  const [written, setWritten] = useState("");
  const [sent, setSent] = useState(false);
  const hand = state.hands[id] ?? [];

  if (id === state.judgeId) {
    return (
      <>
        <h1>You&apos;re the judge this round.</h1>
        <p className="muted">Wait for the answers.</p>
        <Black text={state.black} />
      </>
    );
  }
  if (sent) return <h1>Card played. Watch the TV.</h1>;
  if (!state.waiting.includes(id)) return <h1>Card played. Waiting for the others…</h1>;

  const card = pick === null ? null : hand[pick];
  const blank = card === BLANK;
  const answer = blank ? written.trim() : (card ?? "");
  const [before, word, after] = parts(state.black, answer);

  return (
    <>
      <Black text={state.black} />
      <div className="phone-hand">
        {hand.map((option, index) => (
          <button
            key={`${index}-${option}`}
            type="button"
            className={`card white${option === BLANK ? " blank-card" : ""}${index === pick ? " picked" : ""}`}
            onClick={() => setPick(index)}
          >
            <p>{option}</p>
            <CardFoot />
          </button>
        ))}
      </div>
      <div className="phone-dock">
        {blank && (
          <textarea
            className="phone-write"
            value={written}
            onChange={(event) => setWritten(event.target.value)}
            placeholder="Write anything. It becomes video."
            maxLength={80}
            rows={2}
            autoFocus
          />
        )}
        {answer && (
          <p className="phone-preview">
            {before}
            <mark>{word}</mark>
            {after}
          </p>
        )}
        <button
          type="button"
          className="primary big"
          disabled={!answer || card === null}
          onClick={() => {
            if (card === null) return;
            send({ t: "play", id, card, written: blank ? written.trim() : "" });
            setSent(true);
          }}
        >
          Play this card
        </button>
      </div>
    </>
  );
}

function Judging({ state, id, send }: Props) {
  if (id !== state.judgeId) {
    return (
      <>
        <h1>The judge is watching every answer on the TV.</h1>
        <div className="phone-answers">
          {state.answers.map((answer, index) => (
            <div key={index} className="card white">
              <p>{answer}</p>
            </div>
          ))}
        </div>
      </>
    );
  }
  return (
    <>
      <h1>You&apos;re the judge</h1>
      <p className="muted">Tap an answer to watch it on the TV. Then crown the best.</p>
      <div className="phone-answers">
        {state.answers.map((answer, index) => (
          <div key={index} className="phone-answer">
            <button
              type="button"
              className={`card white${state.preview === index ? " picked" : ""}`}
              onClick={() => send({ t: "look", id, index })}
            >
              <span className="phone-tags">
                {state.preview === index && <span className="phone-tag live">● On TV</span>}
                <span className="phone-tag">{state.ready[index] ? "● Ready" : "Rendering…"}</span>
              </span>
              <p>{answer}</p>
            </button>
            <button type="button" className="phone-crown" onClick={() => send({ t: "crown", id, index })}>
              👑 Crown
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

function Black({ text }: { text: string }) {
  const [before, ...rest] = text.split("____");
  return (
    <div className="card black phone-black">
      <p>
        {before}
        {rest.map((after, index) => (
          <span key={index}>
            <span className="blank" />
            {after}
          </span>
        ))}
      </p>
      <CardFoot />
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

function Orbit({ size }: { size: number }) {
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
