"use client";

import { useReactor, useReactorMessage } from "@reactor-team/js-sdk";
import { useEffect, useRef, useState } from "react";

import { unwrapOrbisMessage } from "@/lib/orbis";

export function useOrbisSession(clearJwt: () => void, getCurrentJwt: () => string | null) {
  const {
    status,
    sessionId,
    connect,
    disconnect,
    sendCommand,
    tracks,
    requestRecording,
    downloadClipAsFile,
  } = useReactor((state) => ({
    status: state.status,
    sessionId: state.sessionId,
    connect: state.connect,
    disconnect: state.disconnect,
    sendCommand: state.sendCommand,
    tracks: state.tracks,
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
  const waiters = useRef(new Map<string, () => void>());
  const runPrompt = useRef("");
  const [live, setLive] = useState("");
  const wantOpen = useRef(false);
  const inFlight = useRef(false);
  const epoch = useRef(0);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drops = useRef(0);
  const failures = useRef(0);
  const [retryIn, setRetryIn] = useState(0);

  const connected = status === "ready";

  useEffect(() => {
    if (status !== "disconnected") return;
    started.current = false;
    chunks.current = 0;
    setOnAir(false);
    setLive("");
    if (!wantOpen.current || inFlight.current || retry.current) return;
    if (drops.current >= 2) {
      wantOpen.current = false;
      setRetryIn(0);
      setError("The studio went dark. Press Reconnect to go back on air.");
      return;
    }
    drops.current += 1;
    setRetryIn(2);
    retry.current = setTimeout(() => {
      retry.current = null;
      void open(true);
    }, 2_000);
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

  const waitFor = (type: string, ms: number) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters.current.delete(type);
        reject(new Error(`Orbis did not send ${type} in time.`));
      }, ms);
      waiters.current.set(type, () => {
        clearTimeout(timer);
        resolve();
      });
    });

  const startRun = async (prompt: string) => {
    const ready = waitFor("conditions_ready", 20_000);
    const reply = unwrapOrbisMessage(await sendCommand("set_prompt", { prompt }));
    if (reply.type === "command_error") {
      waiters.current.delete("conditions_ready");
      ready.catch(() => undefined);
      throw new Error(`set_prompt: ${reply.reason || "rejected"}`);
    }
    await ready;
    runPrompt.current = prompt;
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
        setShowing(prompt);
        setLive("");
        try {
          if (started.current) {
            started.current = false;
            chunks.current = 0;
            const reset = waitFor("generation_reset", 5_000);
            await sendCommand("reset", {});
            await reset.catch(() => undefined);
          }
          if (wanted.current !== null) continue;
          await startRun(prompt);
          failures.current = 0;
          setError("");
        } catch (caught) {
          started.current = false;
          setError(caught instanceof Error ? caught.message : String(caught));
          if (wanted.current === null && failures.current < 2) {
            failures.current += 1;
            await new Promise((resolve) => setTimeout(resolve, 2_500));
            if (wanted.current === null) wanted.current = prompt;
          }
        }
      }
    } finally {
      pumping.current = false;
      if (wanted.current !== null) void pump();
    }
  };

  const show = (prompt: string) => {
    wanted.current = prompt;
    void pump();
  };

  useReactorMessage((raw) => {
    const message = unwrapOrbisMessage(raw);
    const type = message.type ?? "";
    waiters.current.get(type)?.();
    waiters.current.delete(type);
    if (type === "generation_started") {
      started.current = true;
      chunks.current = 0;
    } else if (type === "chunk_complete") {
      chunks.current += 1;
      if (chunks.current >= 2) {
        setOnAir(true);
        setLive(runPrompt.current);
      }
    } else if (type === "generation_reset") {
      started.current = false;
    } else if (type === "generation_complete") {
      started.current = false;
      if (current.current && wanted.current === null) show(current.current);
    } else if (type === "command_error") {
      setError(`${message.command || "command"}: ${message.reason || "rejected"}`);
      if (message.command === "start") started.current = false;
    }
  });

  const record = (seconds: number) =>
    new Promise<string | null>((resolve) => {
      const track = tracks.main_video;
      if (!track || track.readyState !== "live") return resolve(null);
      const type = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
        "video/mp4",
      ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = new MediaRecorder(new MediaStream([track]), {
        mimeType: type,
        videoBitsPerSecond: 4_000_000,
      });
      const parts: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) parts.push(event.data);
      };
      recorder.onstop = () =>
        resolve(
          parts.length ? URL.createObjectURL(new Blob(parts, { type: recorder.mimeType })) : null,
        );
      recorder.onerror = () => resolve(null);
      recorder.start();
      setTimeout(() => recorder.state !== "inactive" && recorder.stop(), seconds * 1000);
    });

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

  const open = async (auto = false) => {
    if (!auto) drops.current = 0;
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
          void open(true);
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
    live,
    tuning: showing !== "" && showing !== live,
    error,
    muted,
    toggleMuted: () => setMuted((value) => !value),
    open,
    close,
    show,
    record,
    saveEpisode,
  };
}

export type OrbisSession = ReturnType<typeof useOrbisSession>;
