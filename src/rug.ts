import {
  BufferAttribute,
  DataTexture,
  FloatType,
  type Material,
  NearestFilter,
  type Object3D,
  RGBAFormat,
  type SkinnedMesh,
  Vector3,
} from 'three';

/**
 * The rug as a sheet: a height field over it that moves like water with a little of
 * paper's stiffness. Creatures press it down where they stand and knock rings out of it
 * where they step, a click drops a stone in the middle, the mouse drawn across it leaves a
 * wake, and the rings run back off its edge. Its acts (a curl, a wave, a cup) are laid over
 * the top.
 *
 * The model's grid of bones holds still. The field goes to the GPU as a small texture each
 * frame and every vertex of the rug looks up its own height and slope in it, so the surface
 * is as smooth as the mesh is fine, and it is lit by the field's own slope.
 */

export const RUG_R = 0.62;
/** Nodes each way, over -L..L metres: the rug and its fringe inside. */
const N = 64;
const L = 0.7;
const DX = (2 * L) / (N - 1);
/** How fast a ring runs out (m/s), how hard it's pulled back flat, how soon it dies away,
 * and a little stiffness that smooths the finest wrinkles first (the paper in it). */
const SPEED = 0.6;
const FLAT = 14;
const DAMP = 1.1;
const STIFF = 0.002;
/** Physics steps a second. */
const HZ = 120;
/** It sits on the floor: it can sink into its own pile this far (m), no further. */
const SINK = 0.012;

export class Sheet {
  private h = new Float32Array(N * N);
  private v = new Float32Array(N * N);
  private force = new Float32Array(N * N);
  /** On the rug (moving), or off it (copying the nearest node on its edge). */
  private inside = new Uint8Array(N * N);
  private edge = new Int32Array(N * N);
  /** What the acts lay over the sheet this frame: height (m) and a pull in toward the middle. */
  readonly lift = new Float32Array(N * N);
  readonly pull = new Float32Array(N * N);
  /** Where each node is (m): across, and toward the viewer. */
  readonly x = new Float32Array(N * N);
  readonly z = new Float32Array(N * N);
  /** Per node: height, its slope across and toward the viewer, and the pull in. */
  private out = new Float32Array(N * N * 4);
  private texture = new DataTexture(this.out, N, N, RGBAFormat, FloatType);
  private acc = 0;
  readonly uniforms = {
    rugField: { value: this.texture },
    /** The rug's axes in the mesh's own space, per metre: across, up, toward the viewer. */
    rugEx: { value: new Vector3(1, 0, 0) },
    rugEy: { value: new Vector3(0, 1, 0) },
    rugEz: { value: new Vector3(0, 0, 1) },
    /** Which way a curl pulls (x, z). */
    rugCurl: { value: [1, 0] as [number, number] },
  };

  constructor() {
    this.texture.minFilter = this.texture.magFilter = NearestFilter;
    for (let b = 0; b < N; b++)
      for (let a = 0; a < N; a++) {
        const i = b * N + a;
        const x = -L + a * DX;
        const z = -L + b * DX;
        this.x[i] = x;
        this.z[i] = z;
        const r = Math.hypot(x, z);
        this.inside[i] = r <= RUG_R ? 1 : 0;
        const k = r > RUG_R ? (RUG_R - DX * 0.75) / r : 1;
        this.edge[i] = Math.round((z * k + L) / DX) * N + Math.round((x * k + L) / DX);
      }
  }

  get count() {
    return N * N;
  }

  /** A knock (a step, a stone): the sheet there is sent down at `speed` m/s. */
  drop(x: number, z: number, speed: number, width = 0.06) {
    this.around(x, z, width, (i, w) => (this.v[i] -= speed * w));
  }

  /** A weight standing there this frame (m/s² down): it sinks in, and a wake follows it. */
  press(x: number, z: number, weight: number, width = 0.08) {
    this.around(x, z, width, (i, w) => (this.force[i] -= weight * w));
  }

  private around(x: number, z: number, width: number, fn: (i: number, w: number) => void) {
    const reach = width * 2.5;
    const a0 = Math.max(1, Math.floor((x - reach + L) / DX));
    const a1 = Math.min(N - 2, Math.ceil((x + reach + L) / DX));
    const b0 = Math.max(1, Math.floor((z - reach + L) / DX));
    const b1 = Math.min(N - 2, Math.ceil((z + reach + L) / DX));
    for (let b = b0; b <= b1; b++)
      for (let a = a0; a <= a1; a++) {
        const i = b * N + a;
        if (!this.inside[i]) continue;
        const d2 = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2;
        fn(i, Math.exp(-d2 / (width * width)));
      }
  }

  /** Move it on by dt, lay the acts over it, and send it to the GPU. */
  update(dt: number) {
    this.acc = Math.min(this.acc + dt, 0.1);
    const s = 1 / HZ;
    while (this.acc >= s) {
      this.acc -= s;
      this.step(s);
    }
    this.force.fill(0);
    this.compose();
    this.texture.needsUpdate = true;
    this.lift.fill(0);
    this.pull.fill(0);
  }

  /** One step of the wave equation, with the rug's edge free (a ring bounces back off it). */
  private step(dt: number) {
    const { h, v, inside } = this;
    const c2 = (SPEED * SPEED) / (DX * DX);
    const nu = STIFF / (DX * DX);
    for (let b = 1; b < N - 1; b++)
      for (let a = 1; a < N - 1; a++) {
        const i = b * N + a;
        if (!inside[i]) continue;
        const hc = h[i];
        const vc = v[i];
        let lap = 0;
        let lapV = 0;
        for (const j of [i - 1, i + 1, i - N, i + N])
          if (inside[j]) {
            lap += h[j] - hc;
            lapV += v[j] - vc;
          }
        v[i] += (c2 * lap + nu * lapV - FLAT * hc - DAMP * vc + this.force[i]) * dt;
      }
    for (let i = 0; i < N * N; i++) if (inside[i]) h[i] += v[i] * dt;
  }

  private compose() {
    const { h, out, inside, edge } = this;
    const height = (i: number) => {
      // It lies on the floor: it rises as far as it likes, but sinks only into its pile.
      const k = h[i];
      return (k > 0 ? k : -SINK * Math.tanh(-k / SINK)) + this.lift[i];
    };
    for (let i = 0; i < N * N; i++) {
      const j = inside[i] ? i : edge[i];
      out[i * 4] = height(j);
      out[i * 4 + 3] = this.pull[j];
    }
    for (let b = 0; b < N; b++)
      for (let a = 0; a < N; a++) {
        const i = b * N + a;
        const l = out[(a > 0 ? i - 1 : i) * 4];
        const r = out[(a < N - 1 ? i + 1 : i) * 4];
        const u = out[(b > 0 ? i - N : i) * 4];
        const d = out[(b < N - 1 ? i + N : i) * 4];
        out[i * 4 + 1] = (r - l) / (2 * DX);
        out[i * 4 + 2] = (d - u) / (2 * DX);
      }
  }

  /**
   * Hook the rug's model up to the sheet: each vertex learns where it sits on the rug, from
   * the still grid of bones, and the materials look their vertices up in the field.
   */
  wear(model: Object3D, materials: Material[]) {
    model.updateMatrixWorld(true);
    let meshes: SkinnedMesh[] = [];
    model.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh && !o.userData.outline) meshes.push(o as SkinnedMesh);
    });
    meshes = meshes.filter((m) => !m.geometry.getAttribute('rugXZ'));
    if (meshes.length) {
      // The bones sit on the rug at known places (set.py): its middle, and its edges.
      const bone = (name: string) => {
        const b = model.getObjectByName(name);
        return b ? meshes[0].worldToLocal(b.getWorldPosition(new Vector3())) : null;
      };
      const mid = bone('g6_6');
      const left = bone('g0_6');
      const right = bone('g12_6');
      const front = bone('g6_0');
      const back = bone('g6_12');
      if (!mid || !left || !right || !front || !back) return;
      const ex = right.sub(left).divideScalar(2 * RUG_R);
      const ez = front.sub(back).divideScalar(2 * RUG_R);
      const ey = new Vector3().crossVectors(ez, ex).normalize().multiplyScalar(ex.length());
      this.uniforms.rugEx.value.copy(ex);
      this.uniforms.rugEy.value.copy(ey);
      this.uniforms.rugEz.value.copy(ez);
      const p = new Vector3();
      for (const mesh of meshes) {
        const n = mesh.geometry.getAttribute('position').count;
        const xz = new Float32Array(n * 2);
        for (let k = 0; k < n; k++) {
          mesh.getVertexPosition(k, p).sub(mid);
          xz[k * 2] = p.dot(ex) / ex.lengthSq();
          xz[k * 2 + 1] = p.dot(ez) / ez.lengthSq();
        }
        mesh.geometry.setAttribute('rugXZ', new BufferAttribute(xz, 2));
      }
    }
    for (const m of materials) this.patch(m);
  }

  private patch(m: Material) {
    if (m.userData.rug) return;
    m.userData.rug = true;
    const before = m.onBeforeCompile;
    const key = m.customProgramCacheKey;
    m.onBeforeCompile = (shader, renderer) => {
      before.call(m, shader, renderer);
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', `${SAMPLE}\nvoid main() {`)
        .replace(
          '#include <skinnormal_vertex>',
          `#include <skinnormal_vertex>
          {
            // Tip the faces that look up by the sheet's slope there.
            vec4 rs = rugAt(rugXZ);
            vec3 up = normalize(rugEy);
            float facing = max(dot(normalize(objectNormal), up), 0.0);
            objectNormal = normalize(objectNormal)
              - (normalize(rugEx) * rs.y + normalize(rugEz) * rs.z) * facing;
          }`,
        )
        .replace(
          '#include <skinning_vertex>',
          `#include <skinning_vertex>
          {
            vec4 rs = rugAt(rugXZ);
            transformed += rugEy * rs.x + (rugEx * rugCurl.x + rugEz * rugCurl.y) * rs.w;
          }`,
        );
    };
    m.customProgramCacheKey = () => `${key.call(m)}-rug`;
    m.needsUpdate = true;
  }
}

const SAMPLE = `
uniform sampler2D rugField;
uniform vec3 rugEx;
uniform vec3 rugEy;
uniform vec3 rugEz;
uniform vec2 rugCurl;
attribute vec2 rugXZ;
vec4 rugAt(vec2 xz) {
  vec2 g = (xz + ${L.toFixed(4)}) / ${DX.toFixed(6)};
  vec2 g0 = clamp(floor(g), 0.0, ${(N - 2).toFixed(1)});
  vec2 f = clamp(g - g0, 0.0, 1.0);
  ivec2 i = ivec2(g0);
  vec4 a = texelFetch(rugField, i, 0);
  vec4 b = texelFetch(rugField, i + ivec2(1, 0), 0);
  vec4 c = texelFetch(rugField, i + ivec2(0, 1), 0);
  vec4 d = texelFetch(rugField, i + ivec2(1, 1), 0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`;
