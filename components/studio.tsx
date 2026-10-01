"use client";

import { ReactorProvider } from "@reactor-team/js-sdk";
import { useCallback, useRef } from "react";

import { Game } from "@/components/game";
import { useOrbisSession } from "@/hooks/use-orbis-session";
import { ORBIS_MODEL_NAME, ORBIS_TRACKS, requestReactorJwt } from "@/lib/orbis";

const TRACKS = [...ORBIS_TRACKS];
const CONNECT_OPTIONS = { autoConnect: false };

export function Studio() {
  const jwtPromise = useRef<Promise<string> | null>(null);
  const currentJwt = useRef<string | null>(null);
  const getJwt = useCallback(async () => {
    const pending = (jwtPromise.current ??= requestReactorJwt());
    try {
      const jwt = await pending;
      currentJwt.current = jwt;
      return jwt;
    } catch (error) {
      if (jwtPromise.current === pending) jwtPromise.current = null;
      throw error;
    }
  }, []);
  const getCurrentJwt = useCallback(() => currentJwt.current, []);
  const clearJwt = useCallback(() => {
    jwtPromise.current = null;
    currentJwt.current = null;
  }, []);

  return (
    <ReactorProvider
      apiUrl="https://api.reactor.inc"
      modelName={ORBIS_MODEL_NAME}
      modelTracks={TRACKS}
      connectOptions={CONNECT_OPTIONS}
      jwtToken={getJwt}
    >
      <Session clearJwt={clearJwt} getCurrentJwt={getCurrentJwt} />
    </ReactorProvider>
  );
}

function Session({
  clearJwt,
  getCurrentJwt,
}: {
  clearJwt: () => void;
  getCurrentJwt: () => string | null;
}) {
  const orbis = useOrbisSession(clearJwt, getCurrentJwt);
  return <Game orbis={orbis} />;
}
