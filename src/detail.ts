import { CanvasTexture, type Material, type MeshStandardMaterial, RepeatWrapping } from 'three';

/**
 * Fine surface detail for the colour look, drawn here rather than shipped in the model:
 * small greyscale tiles (fur, ear grille, rubber, joint grain) that multiply the base
 * colour, projected from three sides from the part's own position so the models need no
 * UVs. Every tile is tileable, 128 px, and drawn from a fixed seed so cats look alike.
 */
export type Detail = 'fur' | 'grille' | 'rubber' | 'grain';

/**
 * A creature's own pattern, kept in its own file: how to draw it (light and dark marks
 * on a mid-grey tile, wrapping at the edges), how many times it repeats per model unit
 * and how strongly it shows.
 */
export interface Tile {
  name: string;
  draw: (g: CanvasRenderingContext2D, size: number, rand: () => number) => void;
  scale: number;
  amount: number;
}

const SIZE = 128;
const tiles = new Map<string, CanvasTexture>();

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function draw(kind: Detail | Tile): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext('2d');
  if (!g) return new CanvasTexture(canvas);
  const name = typeof kind === 'string' ? kind : kind.name;
  const rand = rng(name.length * 7919 + 13);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, SIZE, SIZE);
  /** Draws with wrap-around so the tile repeats seamlessly. */
  const wrapped = (fn: (dx: number, dy: number) => void) => {
    for (const dx of [-SIZE, 0, SIZE]) for (const dy of [-SIZE, 0, SIZE]) fn(dx, dy);
  };
  if (typeof kind !== 'string') kind.draw(g, SIZE, rand);
  else if (kind === 'fur') {
    // Short soft strokes, light and dark, all leaning the same way.
    for (let i = 0; i < 520; i++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      const len = 5 + rand() * 7;
      g.strokeStyle = rand() < 0.5 ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.26)';
      g.lineWidth = 1 + rand();
      wrapped((dx, dy) => {
        g.beginPath();
        g.moveTo(x + dx, y + dy);
        g.lineTo(x + dx + len * 0.35, y + dy + len);
        g.stroke();
      });
    }
  } else if (kind === 'grille') {
    // Fine horizontal slots, a shade darker, with a light edge under each.
    for (let y = 0; y < SIZE; y += 8) {
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(0, y, SIZE, 3);
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.fillRect(0, y + 3, SIZE, 1);
    }
  } else if (kind === 'rubber') {
    // A stipple of tiny bumps, like the sole of a toy.
    for (let i = 0; i < 260; i++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      const r = 1.6 + rand() * 1.6;
      wrapped((dx, dy) => {
        const grad = g.createRadialGradient(x + dx - 0.5, y + dy - 0.5, 0, x + dx, y + dy, r);
        grad.addColorStop(0, 'rgba(255,255,255,0.5)');
        grad.addColorStop(1, 'rgba(0,0,0,0.3)');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x + dx, y + dy, r, 0, Math.PI * 2);
        g.fill();
      });
    }
  } else {
    // Fine grain, like brushed matte metal.
    for (let i = 0; i < 900; i++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      const w = 1 + rand() * 5;
      g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)';
      wrapped((dx, dy) => g.fillRect(x + dx, y + dy, w, 1));
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  return tex;
}

const SETTINGS: Record<Detail, { scale: number; amount: number }> = {
  fur: { scale: 4, amount: 0.35 },
  grille: { scale: 4, amount: 0.4 },
  rubber: { scale: 9, amount: 0.45 },
  grain: { scale: 9, amount: 0.3 },
};

/** A copy of `base` with the detail multiplied in (the caller owns and disposes it). */
export function withDetail(base: Material, kind: Detail | Tile): Material {
  const name = typeof kind === 'string' ? kind : kind.name;
  let tex = tiles.get(name);
  if (!tex) tiles.set(name, (tex = draw(kind)));
  const material = base.clone() as MeshStandardMaterial;
  const { scale, amount } = typeof kind === 'string' ? SETTINGS[kind] : kind;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.detailMap = { value: tex };
    shader.uniforms.detailScale = { value: scale };
    shader.uniforms.detailAmount = { value: amount };
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        'varying vec3 vDetailPos;\nvarying vec3 vDetailNormal;\nvoid main() {',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvDetailPos = position;\nvDetailNormal = normal;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform sampler2D detailMap;
uniform float detailScale;
uniform float detailAmount;
varying vec3 vDetailPos;
varying vec3 vDetailNormal;
void main() {`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec3 w = pow(abs(vDetailNormal), vec3(4.0));
  w /= w.x + w.y + w.z + 1e-4;
  float d = texture2D(detailMap, vDetailPos.zy * detailScale).r * w.x
          + texture2D(detailMap, vDetailPos.xz * detailScale).r * w.y
          + texture2D(detailMap, vDetailPos.xy * detailScale).r * w.z;
  diffuseColor.rgb *= 1.0 + (d - 0.5) * 2.0 * detailAmount;
}`,
      );
  };
  material.customProgramCacheKey = () => 'robot-detail';
  return material;
}
