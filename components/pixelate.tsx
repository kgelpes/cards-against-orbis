"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

const PALETTE = [
  "be4a2f",
  "d77643",
  "ead4aa",
  "e4a672",
  "b86f50",
  "733e39",
  "3e2731",
  "a22633",
  "e43b44",
  "f77622",
  "feae34",
  "fee761",
  "63c74d",
  "3e8948",
  "265c42",
  "193c3e",
  "124e89",
  "0099db",
  "2ce8f5",
  "ffffff",
  "c0cbdc",
  "8b9bb4",
  "5a6988",
  "3a4466",
  "262b44",
  "181425",
  "ff0044",
  "68386c",
  "b55088",
  "f6757a",
  "e8b796",
  "c28569",
];

const VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec3 u_pal[32];

float bayer(vec2 p) {
  vec2 q = mod(p, 4.0);
  float i = q.x + q.y * 4.0;
  float m[16];
  m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;
  m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
  for (int k = 0; k < 16; k++) if (float(k) == i) return (m[k] + 0.5) / 16.0;
  return 0.5;
}

void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 uv = (cell + 0.5) / u_res;
  uv.y = 1.0 - uv.y;
  vec2 o = 0.25 / u_res;
  vec3 c = (texture2D(u_tex, uv + vec2(-o.x, -o.y)).rgb + texture2D(u_tex, uv + vec2(o.x, -o.y)).rgb
          + texture2D(u_tex, uv + vec2(-o.x, o.y)).rgb + texture2D(u_tex, uv + vec2(o.x, o.y)).rgb) * 0.25;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.25);
  c = (c - 0.5) * 1.12 + 0.52 + (bayer(cell) - 0.5) * 0.06;
  vec3 best = u_pal[0];
  float bestD = 99.0;
  for (int i = 0; i < 32; i++) {
    vec3 d = u_pal[i] - c;
    float e = dot(d * vec3(0.30, 0.59, 0.11), d * vec3(0.30, 0.59, 0.11)) + 0.25 * dot(d, d);
    if (e < bestD) { bestD = e; best = u_pal[i]; }
  }
  gl_FragColor = vec4(best, 1.0);
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

export function Pixelate({ children, width = 160 }: { children: ReactNode; width?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [raw, setRaw] = useState(false);
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
    gl.uniform3fv(
      gl.getUniformLocation(program, "u_pal"),
      PALETTE.flatMap((hex) => [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)),
    );
    gl.viewport(0, 0, width, height);

    let frame = 0;
    const draw = () => {
      const video = host.current?.querySelector("video");
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        video.loop = true;
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
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
    <div ref={host} className={`pixelate ${raw ? "raw" : ""}`}>
      <div className="pixelate-source">{children}</div>
      <canvas ref={canvas} width={width} height={height} aria-hidden />
    </div>
  );
}
