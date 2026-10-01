"use client";

import { useEffect, useRef, useState } from "react";

export const ROOM_URL = process.env.NEXT_PUBLIC_ROOM_URL ?? "wss://room.bidslop.com";

export type PublicPlayer = {
  id: string;
  name: string;
  bot: boolean;
  remote: boolean;
  score: number;
};

export type PublicState = {
  phase: "lobby" | "picking" | "judging" | "reveal" | "over";
  black: string;
  target: number;
  round: number;
  players: PublicPlayer[];
  judgeId: string | null;
  waiting: string[];
  hands: Record<string, string[]>;
  answers: string[];
  ready: boolean[];
  preview: number | null;
  winner: { name: string; card: string; sentence: string } | null;
  champion: string | null;
};

export type PhoneMessage =
  | { t: "join"; id: string; name: string }
  | { t: "play"; id: string; card: string; written: string }
  | { t: "look"; id: string; index: number }
  | { t: "crown"; id: string; index: number }
  | { t: "next"; id: string }
  | { t: "watch"; id: string }
  | { t: "rtc-answer"; id: string; sdp: string };

export type HostMessage =
  | { t: "state"; state: PublicState }
  | { t: "rtc"; to: string; sdp: string };

export function useRoom<In>(
  code: string | null,
  role: "host" | "phone",
  onMessage: (message: In) => void,
) {
  const [connected, setConnected] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    if (!code) return;
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const open = () => {
      const ws = new WebSocket(`${ROOM_URL}/room/${code}?role=${role}`);
      socket.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (event) => {
        try {
          handler.current(JSON.parse(String(event.data)) as In);
        } catch {
          return;
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) timer = setTimeout(open, 1500);
      };
    };
    open();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      socket.current?.close();
    };
  }, [code, role]);

  const send = (message: PhoneMessage | HostMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(message));
  };

  return { connected, send };
}
