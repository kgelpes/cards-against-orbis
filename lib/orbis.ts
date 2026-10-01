export const ORBIS_MODEL_NAME = "reactor/visko-orbis-stable";

export const ORBIS_TRACKS = [
  { name: "main_video", kind: "video", direction: "recvonly" },
  { name: "main_audio", kind: "audio", direction: "recvonly" },
] as const;

export const LOBBY_PROMPT =
  "A glamorous late-night TV game show stage, red velvet curtains, sweeping golden spotlights, glitter drifting through the air, an excited studio audience in silhouette, slow cinematic dolly shot.";

export const FINALE_PROMPT =
  "A wildly extravagant award show finale, a giant golden trophy rising on a glittering stage, fireworks and golden confetti raining down, a cheering crowd, sweeping crane shot, cinematic.";

export function scene(sentence: string) {
  return `${sentence} Photoreal cinematic comedy scene, vivid detail, dramatic lighting, dynamic camera move.`;
}

export type OrbisMessage = {
  type?: string;
  command?: string;
  reason?: string;
};

export function unwrapOrbisMessage(raw: unknown): OrbisMessage {
  const envelope = raw as { type?: string; data?: Record<string, unknown> };
  if (envelope?.data && typeof envelope.data === "object") {
    return { ...envelope.data, type: envelope.type } as OrbisMessage;
  }
  return (raw ?? {}) as OrbisMessage;
}

export async function requestReactorJwt() {
  const response = await fetch("/api/token", { method: "POST" });
  const result = (await response.json()) as { jwt?: string; error?: string };
  if (!response.ok || !result.jwt) {
    throw new Error(result.error || "Could not create a Reactor token");
  }
  return result.jwt;
}
