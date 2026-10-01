"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

const VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_time;
uniform float u_flip;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 tex(vec2 uv) { return texture2D(u_tex, clamp(uv, 0.0, 1.0)).rgb; }

void main() {
  vec2 frag = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 uv = frag / u_res;
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  vec2 bent = 0.5 + c * (1.0 + 0.11 * r2 + 0.05 * r2 * r2);
  if (bent.x < 0.0 || bent.x > 1.0 || bent.y < 0.0 || bent.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float line = floor(frag.y / 2.0);
  float jitter = u_flip * (hash(vec2(line, floor(u_time * 30.0))) - 0.5) * 0.08
    + u_flip * sin(frag.y * 0.05 + u_time * 40.0) * 0.02;
  vec2 st = vec2(bent.x + jitter, fract(bent.y + u_flip * 0.35));
  vec2 ca = (bent - 0.5) * 0.006 + vec2(0.0015, 0.0);
  vec3 col = vec3(tex(st + ca).r, tex(st).g, tex(st - ca).b);
  vec2 px = 1.5 / u_res;
  vec3 glow = (tex(st + vec2(px.x, 0.0)) + tex(st - vec2(px.x, 0.0))
    + tex(st + vec2(0.0, px.y)) + tex(st - vec2(0.0, px.y))) * 0.25;
  col = mix(col, glow, 0.35) + max(glow - 0.6, 0.0) * 0.6;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.2) * vec3(1.05, 1.0, 0.94);
  col *= 0.78 + 0.22 * sin(frag.y * 3.14159);
  float m = mod(frag.x, 3.0);
  col *= vec3(m < 1.0 ? 1.08 : 0.94, m >= 1.0 && m < 2.0 ? 1.08 : 0.94, m >= 2.0 ? 1.08 : 0.94);
  float roll = smoothstep(0.0, 0.04, abs(fract(bent.y - u_time * 0.07) - 0.5) - 0.44);
  col *= 1.0 + roll * 0.06;
  col += (hash(frag + fract(u_time) * 100.0) - 0.5) * 0.05;
  col = mix(col, vec3(hash(floor(frag / 2.0) + floor(u_time * 24.0)) * 0.9), u_flip * 0.75);
  col *= 1.0 - smoothstep(0.18, 0.5, r2) * 0.75;
  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl: WebGLRenderingContext) {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERT],
    [gl.FRAGMENT_SHADER, FRAG],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

function signal(since: number) {
  if (since < 0.5) return 1 - since * 0.6;
  return 0.7 * Math.exp(-(since - 0.5) * 1.6);
}

export function Tube({
  children,
  tuning,
  width = 960,
}: {
  children: ReactNode;
  tuning: boolean;
  width?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [raw, setRaw] = useState(false);
  const flippedAt = useRef(performance.now());
  const holding = useRef(tuning);

  useEffect(() => {
    holding.current = tuning;
    if (!tuning) flippedAt.current = performance.now();
  }, [tuning]);
  const height = Math.round((width * 9) / 16);

  useEffect(() => {
    const gl = canvas.current?.getContext("webgl", { antialias: false });
    const program = gl ? compile(gl) : null;
    if (!gl || !program) {
      setRaw(true);
      return;
    }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform2f(gl.getUniformLocation(program, "u_res"), width, height);
    const time = gl.getUniformLocation(program, "u_time");
    const flipLevel = gl.getUniformLocation(program, "u_flip");
    gl.viewport(0, 0, width, height);

    let frame = 0;
    const draw = (now: number) => {
      const video = host.current?.querySelector("video");
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        video.loop = true;
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
          gl.uniform1f(time, (now / 1000) % 1000);
          gl.uniform1f(
            flipLevel,
            holding.current ? 0.85 : signal((now - flippedAt.current) / 1000),
          );
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        } catch {
          setRaw(true);
          return;
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [width, height]);

  return (
    <div ref={host} className={`tube ${raw ? "raw" : ""}`}>
      <div className="tube-source">{children}</div>
      <canvas ref={canvas} width={width} height={height} aria-hidden />
    </div>
  );
}
