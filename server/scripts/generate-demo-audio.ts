/**
 * Generates ORIGINAL synthesized demo tracks (no samples, no third-party material)
 * plus SVG cover art. Output is created by this script and released with the
 * project, so it is safe to play and redistribute.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DEMO_TRACKS } from "../src/providers/demoCatalog.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const SR = 22050;
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function render(spec: (typeof DEMO_TRACKS)[number]): Float32Array {
  const secs = Math.round(spec.durationMs / 1000);
  const out = new Float32Array(SR * secs);
  const beat = 60 / spec.bpm;
  const add = (start: number, dur: number, freq: number, vol: number, type: "sine" | "tri" | "saw") => {
    const s0 = Math.floor(start * SR), n = Math.floor(dur * SR);
    for (let i = 0; i < n && s0 + i < out.length; i++) {
      const t = i / SR, ph = (freq * t) % 1;
      const w = type === "sine" ? Math.sin(2 * Math.PI * ph) : type === "tri" ? 4 * Math.abs(ph - 0.5) - 1 : 2 * ph - 1;
      const env = Math.min(1, i / (0.01 * SR)) * Math.exp(-3 * (t / dur));
      out[s0 + i] += w * vol * env;
    }
  };
  const kick = (start: number) => {
    const s0 = Math.floor(start * SR), n = Math.floor(0.18 * SR);
    for (let i = 0; i < n && s0 + i < out.length; i++) {
      const t = i / SR;
      out[s0 + i] += Math.sin(2 * Math.PI * (120 * t - 400 * t * t)) * 0.5 * Math.exp(-14 * t);
    }
  };
  const hat = (start: number) => {
    const s0 = Math.floor(start * SR), n = Math.floor(0.05 * SR);
    for (let i = 0; i < n && s0 + i < out.length; i++) out[s0 + i] += (Math.random() * 2 - 1) * 0.06 * Math.exp(-60 * (i / SR));
  };
  const bars = Math.floor(secs / (beat * 4));
  for (let bar = 0; bar < bars; bar++) {
    const chord = spec.progression[bar % spec.progression.length];
    const t0 = bar * beat * 4;
    add(t0, beat * 4, midi(chord[0] - 12), 0.22, "tri");
    for (let b = 0; b < 4; b++) {
      kick(t0 + b * beat);
      hat(t0 + (b + 0.5) * beat);
    }
    for (let s = 0; s < 8; s++) {
      const note = chord[s % chord.length] + 12 + (s % 5 === 4 ? 12 : 0);
      add(t0 + s * (beat / 2), beat * 0.9, midi(note), 0.11, spec.lead);
    }
  }
  // gentle fade in/out
  const f = SR * 0.5;
  for (let i = 0; i < f; i++) { out[i] *= i / f; out[out.length - 1 - i] *= i / f; }
  return out;
}

function wav(samples: Float32Array): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.max(-1, Math.min(1, samples[i] * 0.8)) * 32767, 44 + i * 2);
  return buf;
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** 400x400 gradient cover with soft circles, encoded as PNG (React Native cannot render SVG). */
function art(spec: (typeof DEMO_TRACKS)[number]): Buffer {
  const N = 400, [a, b] = [hex(spec.colors[0]), hex(spec.colors[1])];
  const raw = Buffer.alloc((N * 3 + 1) * N);
  for (let y = 0; y < N; y++) {
    raw[y * (N * 3 + 1)] = 0;
    for (let x = 0; x < N; x++) {
      const t = (x + y) / (2 * N);
      let px = [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t);
      const d1 = Math.hypot(x - 130, y - 270), d2 = Math.hypot(x - 300, y - 120), d3 = Math.hypot(x - 200, y - 200);
      if (d1 < 120) px = px.map((v) => v + (255 - v) * 0.12);
      if (d2 < 70) px = px.map((v) => v * 0.82);
      if (d3 < 38) px = px.map((v) => v * 0.45);
      const o = y * (N * 3 + 1) + 1 + x * 3;
      raw[o] = px[0]; raw[o + 1] = px[1]; raw[o + 2] = px[2];
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

fs.mkdirSync(path.join(root, "audio"), { recursive: true });
fs.mkdirSync(path.join(root, "art"), { recursive: true });
for (const spec of DEMO_TRACKS) {
  const wavPath = path.join(root, "audio", `${spec.id}.wav`);
  const mp3Path = path.join(root, "audio", `${spec.id}.mp3`);
  fs.writeFileSync(wavPath, wav(render(spec)));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wavPath, "-codec:a", "libmp3lame", "-b:a", "96k", mp3Path]);
  fs.unlinkSync(wavPath);
  fs.writeFileSync(path.join(root, "art", `${spec.id}.png`), art(spec));
  console.log("generated", spec.id);
}
