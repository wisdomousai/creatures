import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
} from 'three';
import { assets } from './assets';

/**
 * Small tiling textures for a few parts of a robot, drawn here rather than shipped: a
 * part named Joint_Brushed, Joint_Tread, Joint_Mesh or Shell_Print (see bolt.py) gets
 * the pattern of the same name as a greyscale multiplier over its colour. They are kept
 * quiet so the ink look stays clean; the print is for the colour look only.
 */
const N = 128;

/** A tiny seeded generator, so every load draws the same grain. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

const PATTERNS: Record<string, (x: number, y: number, row: number, rand: () => number) => number> =
  {
    // Fine streaks along the part, as on turned or brushed metal.
    brushed: (_x, _y, row, rand) => 0.9 + 0.1 * row + 0.03 * (rand() - 0.5) * 2,
    // Herringbone ribs of a boot sole.
    tread: (x, y) => {
      const phase = (x * 8 + Math.abs(((y * 2) % 1) - 0.5) * 2) % 1;
      return 0.66 + 0.34 * smooth(Math.sin(phase * Math.PI) * 2.2);
    },
    // A fine perforated grille.
    mesh: (x, y) => {
      const d = Math.hypot(((x * 8) % 1) - 0.5, ((y * 8) % 1) - 0.5);
      return 0.4 + 0.6 * smooth((d - 0.24) * 10);
    },
    // A faint halftone dot print on the white shell.
    print: (x, y) => {
      const d = Math.hypot(((x * 8) % 1) - 0.5, ((y * 8) % 1) - 0.5);
      return 1 - 0.09 * smooth((0.2 - d) * 12);
    },
  };

const made = new Map<string, CanvasTexture | null>();

/** The texture for a part role (brushed, tread, mesh, print), or null if there is none. */
export function partTexture(role: string): CanvasTexture | null {
  const key = role.toLowerCase();
  if (made.has(key)) return made.get(key)!;
  const pattern = PATTERNS[key];
  let texture: CanvasTexture | null = null;
  if (pattern && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = N;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const image = ctx.createImageData(N, N);
      const rand = seeded(key.length * 7919 + key.charCodeAt(0));
      const rows = Array.from({ length: N }, rand);
      for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) {
          const v = Math.round(
            255 * Math.min(1, Math.max(0, pattern(i / N, j / N, rows[j], rand))),
          );
          image.data.set([v, v, v, 255], (j * N + i) * 4);
        }
      ctx.putImageData(image, 0, 0);
      texture = new CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.colorSpace = SRGBColorSpace;
      texture.flipY = false; // glTF UVs start at the top left
      texture.magFilter = LinearFilter;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.anisotropy = 4;
    }
  }
  made.set(key, texture);
  return texture;
}

// ---------- Material maps (models/tex) ----------

/**
 * The library's material kit: greyscale maps of wood, planks, plaster, damask, book cloth,
 * leather, velvet and one whole rug, shipped as images. Each tiling map has the same mean
 * grey (the shader divides it out, looks.ts), so a part keeps its palette colour on
 * average and only gains the texture's grain.
 */
const images = new Map<string, Texture | null>();
const waiting = new Map<string, (() => void)[]>();
const ready = new Set<string>();

/**
 * The map called `name`, loaded once and shared (null where there is no document). Its
 * image comes in later: whenLoaded(name, fn) says when.
 */
export function imageTexture(name: string): Texture | null {
  if (images.has(name)) return images.get(name)!;
  let texture: Texture | null = null;
  if (typeof document !== 'undefined') {
    texture = new TextureLoader().load(`${assets}tex/${name}.webp`, () => {
      ready.add(name);
      waiting.get(name)?.forEach((fn) => fn());
      waiting.delete(name);
    });
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.colorSpace = SRGBColorSpace;
    texture.flipY = false; // glTF UVs start at the top left
    texture.generateMipmaps = true;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.anisotropy = 8;
  }
  images.set(name, texture);
  return texture;
}

/** Call `fn` once the map's image is in (now, if it already is). */
export function whenLoaded(name: string, fn: () => void) {
  if (ready.has(name)) fn();
  else waiting.set(name, [...(waiting.get(name) ?? []), fn]);
}
