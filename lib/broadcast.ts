"use client";

import { useEffect, useRef, useState } from "react";

import type { HostMessage, PhoneMessage } from "@/lib/room";

const ICE = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];

function gathered(pc: RTCPeerConnection) {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const done = () => {
      if (pc.iceGatheringState !== "complete") return;
      pc.removeEventListener("icegatheringstatechange", done);
      resolve();
    };
    pc.addEventListener("icegatheringstatechange", done);
    setTimeout(resolve, 2_500);
  });
}

export function useTvBroadcast(send: (message: HostMessage) => void) {
  const stream = useRef<MediaStream | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 854;
    canvas.height = 480;
    const context = canvas.getContext("2d");
    stream.current = canvas.captureStream(24);
    let frame = 0;
    const draw = () => {
      const videos = [
        ...document.querySelectorAll<HTMLVideoElement>(".screen .tube-source video"),
      ].filter((video) => video.readyState >= 2);
      const source = videos[videos.length - 1];
      if (context && source) context.drawImage(source, 0, 0, canvas.width, canvas.height);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    const open = peers.current;
    return () => {
      cancelAnimationFrame(frame);
      for (const pc of open.values()) pc.close();
      open.clear();
    };
  }, []);

  const watch = async (id: string) => {
    peers.current.get(id)?.close();
    const pc = new RTCPeerConnection({ iceServers: ICE });
    peers.current.set(id, pc);
    const track = stream.current?.getVideoTracks()[0];
    if (track && stream.current) pc.addTrack(track, stream.current);
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc);
    sendRef.current({ t: "rtc", to: id, sdp: pc.localDescription?.sdp ?? "" });
  };

  const answer = async (id: string, sdp: string) => {
    const pc = peers.current.get(id);
    if (pc?.signalingState === "have-local-offer")
      await pc.setRemoteDescription({ type: "answer", sdp });
  };

  return { watch, answer };
}

export function usePhoneViewer(id: string, active: boolean, send: (message: PhoneMessage) => void) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    if (!active || !id) return;
    const ask = () => {
      const state = pc.current?.connectionState;
      if (state === "connected" || state === "connecting") return;
      sendRef.current({ t: "watch", id });
    };
    ask();
    const timer = setInterval(ask, 6_000);
    return () => clearInterval(timer);
  }, [active, id]);

  useEffect(() => () => pc.current?.close(), []);

  const offer = async (sdp: string) => {
    pc.current?.close();
    const next = new RTCPeerConnection({ iceServers: ICE });
    pc.current = next;
    next.ontrack = (event) => setStream(event.streams[0] ?? new MediaStream([event.track]));
    await next.setRemoteDescription({ type: "offer", sdp });
    await next.setLocalDescription(await next.createAnswer());
    await gathered(next);
    sendRef.current({ t: "rtc-answer", id, sdp: next.localDescription?.sdp ?? "" });
  };

  return { stream, offer };
}
