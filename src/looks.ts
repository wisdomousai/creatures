import {
  BackSide,
  Color,
  type Material,
  type Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  SkinnedMesh,
  type Texture,
  Vector2,
} from 'three';
import PALETTES from './palettes.json';
import { imageTexture, partTexture, whenLoaded } from './textures';

/**
 * The crew's looks, from the site's tokens (src/styles/global.css), matching LOOKS in
 * art/robot/bolt.py. Models carry no materials of their own, only names that say what
 * each part is (Shell, Joint, Bezel, Glow, Beacon, Flame, Screen, Dot.n); dress()
 * builds the look's materials for those parts. A part with a colour of its own in the
 * colour look is named Base_Role (Shell_Leaf): the other looks draw it as its base.
 */
export const LOOKS = {
  // A small ink robot on the page, with a paper-white face.
  ink: {
    shell: '#1c1c1b',
    joint: '#55554f',
    visor: '#060606',
    bezel: '#55554f',
    glow: '#f4f4f1',
    outline: null,
  },
  // A paper robot drawn in ink, like the page's own line work.
  paper: {
    shell: '#f4f4f1',
    joint: '#55554f',
    visor: '#111111',
    bezel: '#111111',
    glow: '#f4f4f1',
    outline: '#111111',
  },
  // Every creature in its own colours (palettes.json, shared with the Blender previews).
  colour: {
    shell: '#f4f4f1',
    joint: '#55554f',
    visor: '#111111',
    bezel: '#55554f',
    glow: '#f4f4f1',
    outline: null,
  },
} as const;
type Tone = 'shell' | 'joint' | 'visor' | 'bezel' | 'glow';
/** A character's colours in the colour look: over the look's base, for parts with a
 * role of their own, and a blinking dot's colours, off then on. */
export interface Palette {
  base?: Partial<Record<Tone, string>>;
  roles?: Record<string, string>;
  dots?: string[];
  /** Alternative coats (cats): each over the palette's own base and roles. One is worn
   * per model, picked at random the first time it is dressed. */
  coats?: { base?: Partial<Record<Tone, string>>; roles?: Record<string, string> }[];
}
/** Everyone's colours in the colour look, by model name: add yours to colour a creature of
 * your own. */
export const PALETTE = PALETTES as unknown as Record<string, Palette>;

/**
 * Material maps on set pieces (public/robot/tex): which role gets which map, and how big a
 * tile is in metres (the parts' UVs are in metres: kit.box_uv). `whole` is one picture
 * laid over the part's own 0..1 UVs, not a tile.
 */
interface Surface {
  map: string;
  metres: number;
  whole?: boolean;
  /** Its own strength in the looks (the rug is one picture: it needs more to be seen). */
  strength?: Partial<Record<string, number>>;
}
const LEATHER: Surface = { map: 'leather', metres: 0.15 };
const CLOTH: Surface = { map: 'bookcloth', metres: 0.15 };
const WOOD: Surface = { map: 'wood', metres: 0.6 };
const SURFACES: Record<string, Surface> = {
  Wood: WOOD,
  Book0: LEATHER,
  Book1: CLOTH,
  Book2: LEATHER,
  Book3: CLOTH,
  Book4: LEATHER,
  Cushion: { map: 'velvet', metres: 0.25 },
};
const MODEL_SURFACES: Record<string, Record<string, Surface>> = {
  'set-gramophone': { Case: WOOD },
  'set-librug': {
    Pile: { map: 'rug', metres: 1, whole: true, strength: { ink: 0.7, paper: 0.85 } },
  },
};
/** How much of a map shows in each look (1: all of it, 0: none). The ink look stays clean. */
const STRENGTH: Record<string, number> = { ink: 0.25, paper: 0.5, colour: 1 };
/** A map's mean in linear light, which the shader divides out so a part keeps its colour. */
const MEAN: Record<string, number> = { rug: 0.596 };
const MEAN_TILING = 0.69;
export type LookName = keyof typeof LOOKS;
const INK = '#111111';
const tint = new Color();
/** The one colour every light is in, when it isn't the look's own paper-white (the lab's
 * colour dial sets it; dress again to see it). */
export const glowColour: { value: string | null } = { value: null };

/** Flames glow paper-white, or take the beacon's colour. */
export type FlameStyle = 'glow' | 'beacon';

/** Shared by every outline: its width in device pixels and the drawing buffer size. */
export const outlineUniforms = {
  outlinePx: { value: 1.5 },
  viewport: { value: new Vector2(1, 1) },
};

export interface Outfit {
  /** Every material this outfit made, outlines included (for clipping planes). */
  materials: Material[];
  /** Recolour the beacon (and beacon-coloured flames). */
  beacon(colour: string | Color): void;
  /** Brightness of a glowing dot, 0 (dark) to 1, lit in its own colour or the one given. */
  dot(index: number, level: number, colour?: string | Color): void;
  dispose(): void;
}

export function dress(
  root: Object3D,
  look: LookName,
  opts: { screen?: Texture; flame?: FlameStyle; beacon?: string; model?: string } = {},
): Outfit {
  let palette: Palette = look === 'colour' ? (PALETTE[opts.model ?? ''] ?? {}) : {};
  if (palette.coats?.length) {
    const n = palette.coats.length;
    const coat = palette.coats[(root.userData.coat ??= Math.floor(Math.random() * n)) % n];
    palette = {
      ...palette,
      base: { ...palette.base, ...coat.base },
      roles: { ...palette.roles, ...coat.roles },
    };
  }
  const c = {
    ...LOOKS[look],
    ...palette.base,
    ...(glowColour.value && { glow: glowColour.value }),
  };
  const beaconColour = new Color(opts.beacon ?? c.glow);
  const glow = new Color(c.glow);
  const standard = (colour: string, roughness = 0.6) =>
    new MeshStandardMaterial({ color: colour, roughness, metalness: 0 });
  const made: Material[] = [];
  const shared: Record<string, Material> = {
    Shell: standard(c.shell),
    Joint: standard(c.joint, 0.55),
    Bezel: standard(c.bezel, 0.55),
    Glow: new MeshBasicMaterial({ color: glow }),
    Beacon: new MeshBasicMaterial({ color: beaconColour }),
    // Glossy enough to read as glass, rough enough that a highlight never hides the face.
    Screen: new MeshStandardMaterial({
      color: c.visor,
      roughness: 0.45,
      emissive: opts.screen ? 0xffffff : 0x000000,
      emissiveMap: opts.screen ?? null,
    }),
  };
  shared.VisorFace = shared.Screen;
  shared.Flame = opts.flame === 'beacon' ? shared.Beacon : new MeshBasicMaterial({ color: glow });
  for (const [role, colour] of Object.entries(palette.roles ?? {}))
    shared[`_${role}`] = standard(colour);
  made.push(...new Set(Object.values(shared)));
  // Parts with a small texture of their own (Joint_Brushed, Shell_Print: see textures.ts);
  // the print shows in the colour look only.
  const grainy: Record<string, Material | null> = {};
  const grained = (base: string, role?: string) => {
    if (opts.model !== 'bolt' || !role || (role === 'Print' && look !== 'colour')) return null;
    const key = `${base}_${role}`;
    if (!(key in grainy)) {
      const map = partTexture(role);
      const plain = shared[base] as MeshStandardMaterial | undefined;
      grainy[key] = map && plain?.isMeshStandardMaterial ? plain.clone() : null;
      if (grainy[key]) {
        (grainy[key] as MeshStandardMaterial).map = map;
        made.push(grainy[key]!);
      }
    }
    return grainy[key];
  };
  // Set pieces' wood, book cloth, velvet and rug: the colour the part would have had (its
  // role's in the colour look, its base's otherwise) with a map over it, kept to the map's
  // own grain by the shader (mean-compensated, so no part gets darker on average).
  const surfaced: Record<string, Material | null> = {};
  const surface = (base: string, role: string | undefined, mesh: Mesh) => {
    const spec = role && (MODEL_SURFACES[opts.model ?? '']?.[role] ?? SURFACES[role]);
    if (!role || !spec || !opts.model?.startsWith('set-') || !mesh.geometry.getAttribute('uv'))
      return null;
    const key = `${base}_${role}`;
    if (!(key in surfaced)) {
      const map = imageTexture(spec.map);
      const plain = (shared[`_${role}`] ?? shared[base]) as MeshStandardMaterial | undefined;
      let material: MeshStandardMaterial | null = null;
      if (map && plain?.isMeshStandardMaterial) {
        material = plain.clone();
        material.map = map;
        const uniforms = {
          mapStrength: { value: 0 },
          mapMean: { value: MEAN[spec.map] ?? MEAN_TILING },
          mapTile: { value: spec.whole ? 1 : 1 / spec.metres },
        };
        // (Until the image is in, the part is plain.)
        whenLoaded(
          spec.map,
          () => (uniforms.mapStrength.value = spec.strength?.[look] ?? STRENGTH[look]),
        );
        material.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, uniforms);
          shader.fragmentShader = shader.fragmentShader
            .replace(
              'void main() {',
              'uniform float mapStrength;\nuniform float mapMean;\nuniform float mapTile;\nvoid main() {',
            )
            .replace(
              '#include <map_fragment>',
              `#ifdef USE_MAP
                vec4 texel = texture2D( map, vMapUv * mapTile );
                diffuseColor.rgb *= mix( vec3( 1.0 ), texel.rgb / mapMean, mapStrength );
              #endif`,
            );
        };
        material.customProgramCacheKey = () => 'robot-surface';
        made.push(material);
      }
      surfaced[key] = material;
    }
    return surfaced[key];
  };
  const dots: MeshBasicMaterial[] = [];
  const lit = new Color(palette.dots?.[1] ?? c.glow);
  const dim = palette.dots
    ? new Color(palette.dots[0])
    : new Color(c.shell).lerp(new Color(c.joint), 0.5);

  // Dressing again (a new look) replaces the last outfit's outlines.
  const meshes: Mesh[] = [];
  const stale: Object3D[] = [];
  root.traverse((obj) => {
    if (obj.userData.outline) stale.push(obj);
    else if ((obj as Mesh).isMesh) meshes.push(obj as Mesh);
  });
  stale.forEach((obj) => obj.removeFromParent());
  for (const mesh of meshes) {
    const name: string = (mesh.userData.role ??= (mesh.material as Material).name);
    mesh.frustumCulled = false; // skinned bounds are the rest pose's
    const dot = /^Dot\.?(\d+)/.exec(name);
    if (dot) {
      const m = new MeshBasicMaterial({ color: lit });
      dots[Number(dot[1])] = m;
      made.push(m);
      mesh.material = m;
    } else {
      const [base, role] = name.replace(/\.\d+$/, '').split('_');
      mesh.material =
        surface(base, role, mesh) ||
        (role && shared[`_${role}`]) ||
        grained(base, role) ||
        shared[base] ||
        shared.Shell;
    }
    // Glowing parts that stand out against the page (flames, the beacon) are paper-white,
    // so on the ink look they get the ink line the paper look has everywhere.
    const line = c.outline ?? (/^(Flame|Beacon)/.test(name) ? INK : null);
    if (line) addOutline(mesh, line, made);
  }

  return {
    materials: made,
    beacon(colour) {
      beaconColour.set(colour);
      (shared.Beacon as MeshBasicMaterial).color.copy(beaconColour);
    },
    dot(index, level, colour) {
      dots[index]?.color.copy(dim).lerp(colour ? tint.set(colour) : lit, level);
    },
    dispose() {
      made.forEach((m) => m.dispose());
    },
  };
}

/**
 * An ink line round a part, by the inverted-hull trick used in the Blender previews: the
 * part drawn again, back faces only, each vertex pushed out along its normal on screen by
 * a fixed number of pixels, so the line stays the same weight at any size.
 */
function addOutline(mesh: Mesh, colour: string, made: Material[]) {
  const material = new MeshBasicMaterial({ color: colour, side: BackSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, outlineUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float outlinePx;\nuniform vec2 viewport;\nvoid main() {')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        #if defined( USE_ENVMAP ) || defined( USE_SKINNING )
          vec3 outlineNormal = objectNormal;
        #else
          vec3 outlineNormal = normal;
        #endif
        vec2 outlineDir = (projectionMatrix * vec4(normalize(normalMatrix * outlineNormal), 0.0)).xy;
        gl_Position.xy += normalize(outlineDir + 1e-6) * outlinePx * 2.0 / viewport * gl_Position.w;`,
      );
  };
  material.customProgramCacheKey = () => 'robot-outline';
  made.push(material);
  let hull: Mesh;
  if ((mesh as SkinnedMesh).isSkinnedMesh) {
    const skinned = mesh as SkinnedMesh;
    const s = new SkinnedMesh(skinned.geometry, material);
    s.bind(skinned.skeleton, skinned.bindMatrix);
    hull = s;
  } else {
    hull = mesh.clone();
    hull.material = material;
  }
  hull.userData.outline = true;
  hull.position.copy(mesh.position);
  hull.quaternion.copy(mesh.quaternion);
  hull.scale.copy(mesh.scale);
  hull.frustumCulled = false;
  mesh.parent?.add(hull);
}
