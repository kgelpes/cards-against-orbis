"use client";

import { type Clip, useReactor, useReactorMessage } from "@reactor-team/js-sdk";
import { useEffect, useRef, useState } from "react";

import { unwrapOrbisMessage } from "@/lib/orbis";

export function useOrbisSession(clearJwt: () => void, getCurrentJwt: () => string | null) {
  const {
    status,
    sessionId,
    connect,
    disconnect,
    sendCommand,
    requestClip,
    requestRecording,
    downloadClipAsFile,
  } = useReactor((state) => ({
    status: state.status,
    sessionId: state.sessionId,
    connect: state.connect,
    disconnect: state.disconnect,
    sendCommand: state.sendCommand,
    requestClip: state.requestClip,
    requestRecording: state.requestRecording,
    downloadClipAsFile: state.downloadClipAsFile,
  }));

  const [onAir, setOnAir] = useState(false);
  const [showing, setShowing] = useState("");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(true);

  const started = useRef(false);
  const chunks = useRef(0);
  const wanted = useRef<string | null>(null);
  const current = useRef("");
  const pumping = useRef(false);
  const conditionsReady = useRef<(() => void) | null>(null);
  const wantOpen = useRef(false);
  const inFlight = useRef(false);
  const epoch = useRef(0);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [retryIn, setRetryIn] = useState(0);

  const connected = status === "ready";

  useEffect(() => {
    if (status !== "disconnected") return;
    started.current = false;
    chunks.current = 0;
    setOnAir(false);
    if (wantOpen.current && !inFlight.current && !retry.current) {
      setRetryIn(2);
      retry.current = setTimeout(() => {
        retry.current = null;
        void open();
      }, 2_000);
    }
  }, [status]);

  useEffect(() => {
    const handlePageHide = (event: PageTransitionEvent) => {
      if (event.persisted || !sessionId) return;
      const jwt = getCurrentJwt();
      if (!jwt) return;
      void fetch("/api/session-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, jwt }),
        keepalive: true,
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [getCurrentJwt, sessionId]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !sessionId) return;
    const jwt = getCurrentJwt();
    if (!jwt) return;
    void fetch("/api/session-registry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, jwt }),
    }).catch(() => undefined);
  }, [getCurrentJwt, sessionId]);

  const startRun = async (prompt: string) => {
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        conditionsReady.current = null;
        reject(new Error("Orbis did not get ready in time."));
      }, 20_000);
      conditionsReady.current = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    const reply = unwrapOrbisMessage(await sendCommand("set_prompt", { prompt }));
    if (reply.type === "command_error") {
      conditionsReady.current = null;
      throw new Error(`set_prompt: ${reply.reason || "rejected"}`);
    }
    await ready;
    await sendCommand("start", {});
    started.current = true;
  };

  const pump = async () => {
    if (pumping.current) return;
    pumping.current = true;
    try {
      while (wanted.current !== null) {
        const prompt = wanted.current;
        wanted.current = null;
        current.current = prompt;
        if (started.current) await sendCommand("set_prompt", { prompt });
        else await startRun(prompt);
        setShowing(prompt);
        setError("");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      pumping.current = false;
    }
  };

  const show = (prompt: string) => {
    wanted.current = prompt;
    void pump();
  };

  useReactorMessage((raw) => {
    const message = unwrapOrbisMessage(raw);
    if (message.type === "conditions_ready") {
      conditionsReady.current?.();
      conditionsReady.current = null;
    } else if (message.type === "generation_started") {
      started.current = true;
      chunks.current = 0;
    } else if (message.type === "chunk_complete") {
      chunks.current += 1;
      if (chunks.current >= 2) setOnAir(true);
    } else if (message.type === "generation_complete" || message.type === "generation_reset") {
      started.current = false;
      setOnAir(false);
      if (current.current && wanted.current === null) show(current.current);
    } else if (message.type === "command_error") {
      setError(`${message.command || "command"}: ${message.reason || "rejected"}`);
      if (message.command === "start") started.current = false;
    }
  });

  const clip = async (seconds: number): Promise<Clip | null> => {
    try {
      return await requestClip(seconds);
    } catch {
      return null;
    }
  };

  const saveEpisode = async () => {
    try {
      const episode = await requestRecording();
      await downloadClipAsFile(episode, "cards-against-orbis-episode.mp4");
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    }
  };

  const open = async () => {
    wantOpen.current = true;
    const mine = ++epoch.current;
    if (retry.current) clearTimeout(retry.current);
    retry.current = null;
    setError("");
    clearJwt();
    inFlight.current = true;
    try {
      await connect();
      if (epoch.current === mine) setRetryIn(0);
    } catch (caught) {
      if (epoch.current !== mine || !wantOpen.current) return;
      const message = caught instanceof Error ? caught.message : String(caught);
      const busy = /429|capacity/i.test(message);
      setError(busy ? "Every Orbis studio is busy right now. Retrying…" : message);
      setRetryIn(busy ? 8 : 5);
      retry.current = setTimeout(
        () => {
          retry.current = null;
          void open();
        },
        busy ? 8_000 : 5_000,
      );
    } finally {
      if (epoch.current === mine) inFlight.current = false;
    }
  };

  const close = async () => {
    wantOpen.current = false;
    epoch.current += 1;
    inFlight.current = false;
    if (retry.current) clearTimeout(retry.current);
    retry.current = null;
    setRetryIn(0);
    started.current = false;
    setOnAir(false);
    try {
      await disconnect();
    } finally {
      clearJwt();
    }
  };

  return {
    status,
    connected,
    retrying: retryIn > 0,
    onAir,
    showing,
    error,
    muted,
    toggleMuted: () => setMuted((value) => !value),
    open,
    close,
    show,
    clip,
    saveEpisode,
  };
}

export type OrbisSession = ReturnType<typeof useOrbisSession>;
