"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

const VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_radius;

vec3 tex(vec2 uv) { return texture2D(u_tex, clamp(uv, 0.0, 1.0)).rgb; }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 frag = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 uv = frag / u_res;
  vec2 px = 1.0 / u_res;
  vec3 m0 = vec3(0.0), m1 = vec3(0.0), m2 = vec3(0.0), m3 = vec3(0.0);
  vec3 s0 = vec3(0.0), s1 = vec3(0.0), s2 = vec3(0.0), s3 = vec3(0.0);
  float n = 0.0;
  for (int j = 0; j <= 5; j++) {
    for (int i = 0; i <= 5; i++) {
      if (float(i) > u_radius || float(j) > u_radius) continue;
      vec2 o = vec2(float(i), float(j)) * px;
      vec3 c;
      c = tex(uv + vec2(-o.x, -o.y)); m0 += c; s0 += c * c;
      c = tex(uv + vec2(o.x, -o.y)); m1 += c; s1 += c * c;
      c = tex(uv + vec2(-o.x, o.y)); m2 += c; s2 += c * c;
      c = tex(uv + vec2(o.x, o.y)); m3 += c; s3 += c * c;
      n += 1.0;
    }
  }
  m0 /= n; m1 /= n; m2 /= n; m3 /= n;
  float v0 = dot(abs(s0 / n - m0 * m0), vec3(1.0));
  float v1 = dot(abs(s1 / n - m1 * m1), vec3(1.0));
  float v2 = dot(abs(s2 / n - m2 * m2), vec3(1.0));
  float v3 = dot(abs(s3 / n - m3 * m3), vec3(1.0));
  vec3 col = m0;
  float best = v0;
  if (v1 < best) { best = v1; col = m1; }
  if (v2 < best) { best = v2; col = m2; }
  if (v3 < best) { best = v3; col = m3; }

  vec2 o = 1.6 * px;
  float tl = luma(tex(uv + vec2(-o.x, o.y))), t = luma(tex(uv + vec2(0.0, o.y))), tr = luma(tex(uv + o));
  float l = luma(tex(uv - vec2(o.x, 0.0))), r = luma(tex(uv + vec2(o.x, 0.0)));
  float bl = luma(tex(uv - o)), b = luma(tex(uv - vec2(0.0, o.y))), br = luma(tex(uv + vec2(o.x, -o.y)));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -bl - 2.0 * b - br + tl + 2.0 * t + tr;
  float edge = smoothstep(0.4, 0.85, length(vec2(gx, gy)));

  float g = luma(col);
  col = mix(vec3(g), col, 1.3);
  col = mix(col, col * 0.25, edge * 0.6);
  col *= vec3(1.04, 1.0, 0.94);
  vec2 q = uv - 0.5;
  col *= 1.0 - dot(q, q) * 0.8;
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

export function Painted({
  children,
  width = 640,
  radius = 5,
}: {
  children: ReactNode;
  width?: number;
  radius?: number;
}) {
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
    gl.uniform1f(gl.getUniformLocation(program, "u_radius"), radius);
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
  }, [width, height, radius]);

  return (
    <div ref={host} className={`painted ${raw ? "raw" : ""}`}>
      <div className="painted-source">{children}</div>
      <canvas ref={canvas} width={width} height={height} aria-hidden />
    </div>
  );
}
