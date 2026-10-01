import { DurableObject } from "cloudflare:workers";

type Env = { ROOMS: DurableObjectNamespace<Room> };

const ROOM_PATH = /^\/room\/([A-Z0-9]{4,8})$/;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const code = new URL(req.url).pathname.match(ROOM_PATH)?.[1];
    if (code && req.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(req);
    }
    return new Response("cards against orbis rooms");
  },
};

// ponytail: in-memory state, lost if the DO is evicted; host re-sends state on its next change.
export class Room extends DurableObject<Env> {
  sockets = new Map<WebSocket, string>();
  last: string | null = null;

  async fetch(req: Request): Promise<Response> {
    const role = new URL(req.url).searchParams.get("role") === "host" ? "host" : "phone";
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();
    this.sockets.set(server, role);
    if (this.last) send(server, this.last);

    server.addEventListener("message", (e) => {
      if (typeof e.data !== "string") return;
      const text = e.data;
      if (role === "host") {
        try {
          if (JSON.parse(text)?.t === "state") this.last = text;
        } catch {}
      }
      for (const ws of this.sockets.keys()) if (ws !== server) send(ws, text);
    });
    const drop = () => this.sockets.delete(server);
    server.addEventListener("close", drop);
    server.addEventListener("error", drop);

    return new Response(null, { status: 101, webSocket: client });
  }
}

function send(ws: WebSocket, text: string) {
  try {
    ws.send(text);
  } catch {}
}
