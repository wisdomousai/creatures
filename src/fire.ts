import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  Object3D,
  PlaneGeometry,
  PointLight,
  ShaderMaterial,
  Vector3,
} from 'three';
import { clamp } from './character';

/**
 * A fire in the fireplace (set-fireplace): flames, a bed of embers on the logs, sparks that
 * rise and go out, and the warm light it throws on whoever is near. It stands at the
 * fireplace's fire bone, in the model's metres (so it grows and shrinks with it), and it
 * burns whatever the look: fire is the one warm thing in the room.
 *
 * How it burns is `heat` (1 a steady fire), plus a `flare` that dies away (a log settling,
 * a poke) and bursts of sparks (a crackle).
 */

const NOISE = /* glsl */ `
float fHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fHash(i), fHash(i + vec2(1, 0)), u.x), mix(fHash(i + vec2(0, 1)), fHash(i + vec2(1, 1)), u.x), u.y);
}
float fFbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int k = 0; k < 4; k++) { v += a * fNoise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return v;
}
`;

/** A flame: a tongue that licks up, torn by noise rising through it, white-yellow at its
 * heart, orange, red at the tips. */
const FLAME_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform float uSeed;
uniform float uHeat;
${NOISE}
void main() {
  vec2 uv = vUv;
  float t = uTime * (1.3 + 0.2 * uSeed);
  // It sways and wavers more toward its tip.
  float sway = (fNoise(vec2(uv.y * 2.2 - t * 1.1, uSeed * 9.0)) - 0.5) * 0.45 * uv.y;
  float x = (uv.x - 0.5 - sway) * 2.0;
  // The tongue: widest low down, drawn to a point, and narrowed at the root, where it
  // comes off the logs.
  float h = uv.y / max(0.35, uHeat);
  // (Narrower than its card, so however it sways it never reaches the card's edge.)
  float width = pow(max(0.0, 1.0 - h), 0.75) * smoothstep(0.0, 0.14, h) * 0.6;
  float body = 1.0 - smoothstep(width * 0.55, width, abs(x));
  // Torn by noise rising through it.
  float n = fFbm(vec2(x * 2.2 + uSeed * 3.0, uv.y * 3.4 - t * 2.6));
  float lick = body * smoothstep(0.18, 0.62, n + 0.55 - h * 0.85);
  float core = lick * (1.0 - smoothstep(0.0, 0.55, h + abs(x) * 0.9));
  vec3 red = vec3(0.75, 0.16, 0.03);
  vec3 orange = vec3(1.0, 0.46, 0.08);
  vec3 yellow = vec3(1.0, 0.82, 0.42);
  vec3 col = mix(red, orange, smoothstep(0.1, 0.55, lick));
  col = mix(col, yellow, core);
  float a = lick * (0.65 + 0.35 * uHeat);
  gl_FragColor = vec4(col * a, a);
}
`;

/** The bed of embers on the logs: a low glow, crawling. */
const EMBER_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform float uHeat;
${NOISE}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float bed = 1.0 - smoothstep(0.35, 1.0, length(p * vec2(1.0, 2.2)));
  float crawl = fFbm(vec2(vUv.x * 7.0 + uTime * 0.25, vUv.y * 3.0 - uTime * 0.4));
  float glow = bed * (0.35 + 0.65 * smoothstep(0.35, 0.8, crawl)) * (0.6 + 0.4 * uHeat);
  vec3 col = mix(vec3(0.55, 0.08, 0.02), vec3(1.0, 0.45, 0.1), smoothstep(0.4, 0.85, crawl));
  gl_FragColor = vec4(col * glow, glow);
}
`;

const SPARK_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vLife;
void main() {
  float d = length(vUv * 2.0 - 1.0);
  float a = (1.0 - smoothstep(0.2, 1.0, d)) * vLife;
  gl_FragColor = vec4(vec3(1.0, 0.62, 0.25) * a, a);
}
`;

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SPARK_VERT = /* glsl */ `
attribute float life;
varying vec2 vUv;
varying float vLife;
void main() {
  vUv = uv;
  vLife = life;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

function glowing(fragmentShader: string, vertexShader = QUAD_VERT, uniforms = {}) {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { uTime: { value: 0 }, uHeat: { value: 1 }, uSeed: { value: 0 }, ...uniforms },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
}

/** The flames: across the grate, the middle ones tallest (x, width, height, in metres). */
const FLAMES: [number, number, number][] = [
  [-0.13, 0.24, 0.2],
  [-0.05, 0.3, 0.3],
  [0.04, 0.3, 0.34],
  [0.12, 0.24, 0.22],
  [0.0, 0.45, 0.18],
];
/** A candle's flame (m). */
const CANDLE = [0.03, 0.05] as const;

interface Spark {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
}

const MAX_SPARKS = 40;

export class Fire {
  readonly group = new Group();
  readonly light = new PointLight(0xff8a3c, 0, 0, 0);
  private flames: Mesh<PlaneGeometry, ShaderMaterial>[] = [];
  private candles: Mesh<PlaneGeometry, ShaderMaterial>[] = [];
  private embers: Mesh<PlaneGeometry, ShaderMaterial>;
  private sparks: InstancedMesh<PlaneGeometry, ShaderMaterial>;
  private sparkLife: Float32Array;
  private pool: Spark[] = [];
  private time = 0;
  /** Burning: 0 out, 1 a steady fire, more roaring. */
  heat = 1;
  /** A flare that dies away. */
  flare = 0;
  /** How bright it is this frame, flicker and all (for the glow on the walls). */
  level = 0;
  private dummy = new Object3D();

  /** `candles`: where candles stand to be lit with it (m from the fire, their wicks). */
  constructor(candles: readonly (readonly [number, number, number])[] = []) {
    const quad = new PlaneGeometry(1, 1);
    quad.translate(0, 0.5, 0);
    candles.forEach(([x, y, z], i) => {
      const m = new Mesh(quad, glowing(FLAME_FRAG));
      m.material.uniforms.uSeed.value = 7.3 + i * 2.1;
      m.position.set(x, y, z);
      m.scale.set(CANDLE[0], CANDLE[1], 1);
      m.renderOrder = 2;
      this.candles.push(m);
    });
    FLAMES.forEach(([x, w, h], i) => {
      const m = new Mesh(quad, glowing(FLAME_FRAG));
      m.material.uniforms.uSeed.value = i * 1.37 + 0.4;
      m.position.set(x, 0, 0.01 - i * 0.004);
      m.scale.set(w, h, 1);
      m.renderOrder = 2;
      this.flames.push(m);
    });
    this.embers = new Mesh(new PlaneGeometry(1, 1), glowing(EMBER_FRAG));
    this.embers.position.set(0, 0.02, 0.03);
    this.embers.scale.set(0.42, 0.1, 1);
    this.embers.renderOrder = 1;
    const spark = new PlaneGeometry(1, 1);
    this.sparkLife = new Float32Array(MAX_SPARKS);
    spark.setAttribute('life', new InstancedBufferAttribute(this.sparkLife, 1));
    this.sparks = new InstancedMesh(spark, glowing(SPARK_FRAG, SPARK_VERT), MAX_SPARKS);
    this.sparks.count = 0;
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 3;
    this.group.add(this.embers, ...this.flames, ...this.candles, this.sparks, this.light);
    this.light.position.set(0, 0.15, 0.35);
    this.group.visible = false;
  }

  /** Sparks thrown up lately (a crackle's worth, for its sound): read and cleared. */
  pops = 0;

  /** Throw up a few sparks (a crackle), or a lot (a poke). */
  burst(n: number) {
    for (let i = 0; i < n; i++) this.spark(1.5);
    this.pops += n;
  }

  private spark(kick = 1) {
    if (this.pool.length >= MAX_SPARKS) return;
    this.pool.push({
      x: (Math.random() - 0.5) * 0.28,
      y: 0.05 + Math.random() * 0.08,
      z: 0.02 + Math.random() * 0.04,
      vx: (Math.random() - 0.5) * 0.12 * kick,
      vy: (0.25 + Math.random() * 0.35) * kick,
      life: 0.8 + Math.random() * 1.2,
      age: 0,
    });
  }

  /**
   * Stand it at `at` (world), `scale` world units per metre of the model, burning if
   * `lit` (it dies down and comes up over a second or so).
   */
  update(dt: number, at: Vector3, scale: number, lit: boolean) {
    this.time += dt;
    const t = this.time;
    this.flare = Math.max(0, this.flare - dt * 0.8);
    const want = lit ? this.heat + this.flare : 0;
    const was = this.level;
    // The flicker: a slow breath, a quicker waver, and now and then a gutter.
    const flicker =
      0.82 +
      0.1 * Math.sin(t * 2.1) +
      0.07 * Math.sin(t * 7.3 + 1.1) +
      0.05 * Math.sin(t * 13.7 + 2.3);
    const burning = clamp(want, 0, 2.2);
    this.level = was + (burning * flicker - was) * Math.min(1, dt * (lit ? 3 : 1.5));
    this.group.visible = this.level > 0.01;
    this.group.position.copy(at);
    this.group.scale.setScalar(scale);
    const heat = clamp(this.level, 0, 2);
    for (const m of this.flames) {
      m.material.uniforms.uTime.value = t;
      m.material.uniforms.uHeat.value = heat;
    }
    // The candles: steady, but for a draught when the fire flares.
    for (const m of this.candles) {
      m.material.uniforms.uTime.value = t * 0.6;
      m.material.uniforms.uHeat.value = lit ? 0.75 + 0.15 * Math.sin(t * 9 + m.position.x * 40) : 0;
      m.visible = lit;
    }
    this.embers.material.uniforms.uTime.value = t;
    this.embers.material.uniforms.uHeat.value = Math.max(heat, lit ? 0.4 : 0);
    // Its light, reaching a few metres of the model's.
    this.light.intensity = 2.2 * heat;
    this.light.distance = 4 * scale;
    // Sparks: a few all the time, more when it roars.
    if (lit && Math.random() < dt * (0.8 + heat * 1.5)) this.spark();
    this.pool = this.pool.filter((s) => (s.age += dt) < s.life);
    this.sparks.count = this.pool.length;
    this.pool.forEach((s, i) => {
      s.vy += dt * 0.05;
      s.vx += (Math.random() - 0.5) * dt * 0.6;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const size = 0.012 * (1 - (s.age / s.life) * 0.6);
      this.dummy.position.set(s.x, s.y, s.z);
      this.dummy.scale.setScalar(size);
      this.dummy.updateMatrix();
      this.sparks.setMatrixAt(i, this.dummy.matrix);
      this.sparkLife[i] = 1 - s.age / s.life;
    });
    this.sparks.instanceMatrix.needsUpdate = true;
    this.sparks.geometry.getAttribute('life').needsUpdate = true;
  }

  /** The fire's colour, for the glow it throws on the walls. */
  static readonly colour = new Color(0xff8a3c);

  dispose() {
    this.group.removeFromParent();
    [...this.flames, ...this.candles].forEach((m) => m.material.dispose());
    this.flames[0]?.geometry.dispose();
    this.embers.geometry.dispose();
    this.embers.material.dispose();
    this.sparks.geometry.dispose();
    this.sparks.material.dispose();
    this.light.dispose();
  }
}
