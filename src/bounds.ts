import {
  Box3,
  BufferAttribute,
  type BufferGeometry,
  Matrix4,
  Mesh,
  type Object3D,
  type Skeleton,
  type SkinnedMesh,
  Sphere,
  Vector3,
} from 'three';

/**
 * How far round its bones a rigged part reaches, so it can be left out when it's out of
 * view. Three.js tests a skinned part against the view with a sphere it works out once,
 * in the pose the part is in then, and a limb swings out of that (a bubble drifts metres
 * off): so every part used to be drawn always, wherever it was, in view or not. Instead,
 * each bone's reach is measured once (the farthest any vertex hanging on it is, in the
 * bone's own space), and each frame the part is somewhere inside its bones' balls, each
 * that reach round where its bone is now (a posed vertex is a blend of points each inside
 * one of them). A dozen bones a part, not its thousands of vertices.
 */
export function followBones(mesh: SkinnedMesh) {
  if (mesh.userData.followsBones) return;
  mesh.userData.followsBones = true;
  const reach = reachOf(mesh);
  const box = new Box3();
  const ball = new Box3();
  const at = new Vector3();
  const sphere = new Sphere();
  mesh.frustumCulled = true;
  stale(mesh);
  // Worked out when the renderer first asks, in a frame: after every matrix is up to date.
  mesh.computeBoundingSphere = function (this: SkinnedMesh) {
    box.makeEmpty();
    const bones = this.skeleton.bones;
    for (const [i, r] of reach) {
      const m = bones[i].matrixWorld;
      at.setFromMatrixPosition(m);
      ball.min.copy(at).subScalar(r * m.getMaxScaleOnAxis());
      ball.max.copy(at).addScalar(r * m.getMaxScaleOnAxis());
      box.union(ball);
    }
    // (In the skeleton's space: into the part's own, as the renderer has it.)
    (this.boundingSphere ??= new Sphere()).copy(box.getBoundingSphere(sphere));
    this.boundingSphere.applyMatrix4(this.bindMatrixInverse);
  };
  // And asked again next frame: the renderer brings every matrix up to date first, the
  // part's own too, whether it was drawn or not.
  const update = mesh.updateMatrixWorld;
  mesh.updateMatrixWorld = function (this: SkinnedMesh, force?: boolean) {
    update.call(this, force);
    stale(this);
  };
}

/** Its sphere to be worked out again (three.js does, when it's null: its types say it's
 * never null, but it starts so). */
function stale(mesh: SkinnedMesh) {
  (mesh as { boundingSphere: Sphere | null }).boundingSphere = null;
}

/** Each bone a part's vertices hang on, and the farthest any of them is from it. */
const reaches = new WeakMap<BufferGeometry, WeakMap<Skeleton, Map<number, number>>>();
function reachOf(mesh: SkinnedMesh) {
  const { geometry, skeleton } = mesh;
  let bySkeleton = reaches.get(geometry);
  if (!bySkeleton) reaches.set(geometry, (bySkeleton = new WeakMap()));
  let reach = bySkeleton.get(skeleton);
  if (reach) return reach;
  reach = new Map();
  const pos = geometry.attributes.position;
  const index = geometry.attributes.skinIndex;
  const weight = geometry.attributes.skinWeight;
  const v = new Vector3();
  const local = new Vector3();
  const toBone = new Matrix4();
  for (let k = 0; k < pos.count; k++) {
    v.fromBufferAttribute(pos, k).applyMatrix4(mesh.bindMatrix);
    for (let j = 0; j < 4; j++) {
      if (weight.getComponent(k, j) === 0) continue;
      const b = index.getComponent(k, j);
      toBone.copy(skeleton.boneInverses[b]);
      const r = local.copy(v).applyMatrix4(toBone).length();
      if (r > (reach.get(b) ?? -1)) reach.set(b, r);
    }
  }
  bySkeleton.set(skeleton, reach);
  return reach;
}

/**
 * A rigged model that won't move again (a piece of furniture standing as scenery), as
 * plain meshes in the pose it's in now: rigged, each part's skeleton would be worked out
 * and sent to the graphics every frame it's drawn. Its outlines (dress) share its parts'
 * shapes. Only for a model nothing animates: a set piece or a prop that's alive moves
 * its bones.
 */
export function still(model: Object3D) {
  model.updateWorldMatrix(true, false);
  model.updateMatrixWorld(true);
  const posed = new Map<BufferGeometry, Map<Skeleton, BufferGeometry>>();
  const v = new Vector3();
  const n = new Vector3();
  const skinned: SkinnedMesh[] = [];
  model.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) skinned.push(o as SkinnedMesh);
  });
  for (const m of skinned) {
    let byPose = posed.get(m.geometry);
    if (!byPose) posed.set(m.geometry, (byPose = new Map()));
    let geometry = byPose.get(m.skeleton);
    if (!geometry) {
      // (Into new arrays of floats: a model's own are often packed small, as whole numbers
      // to scale, which a pose may not fit.)
      const pos = m.geometry.attributes.position;
      const nor = m.geometry.attributes.normal;
      const positions = new Float32Array(pos.count * 3);
      const normals = nor ? new Float32Array(pos.count * 3) : null;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (nor) n.fromBufferAttribute(nor, i).add(v);
        m.applyBoneTransform(i, v).toArray(positions, i * 3);
        // (Each vertex's blend of its bones is one affine map: a normal's end goes with it.)
        if (normals) m.applyBoneTransform(i, n).sub(v).normalize().toArray(normals, i * 3);
      }
      geometry = m.geometry.clone();
      geometry.deleteAttribute('skinIndex');
      geometry.deleteAttribute('skinWeight');
      geometry.setAttribute('position', new BufferAttribute(positions, 3));
      if (normals) geometry.setAttribute('normal', new BufferAttribute(normals, 3));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      byPose.set(m.skeleton, geometry);
    }
    const mesh = new Mesh(geometry, m.material);
    mesh.name = m.name;
    mesh.userData = { ...m.userData, followsBones: undefined };
    mesh.renderOrder = m.renderOrder;
    mesh.position.copy(m.position);
    mesh.quaternion.copy(m.quaternion);
    mesh.scale.copy(m.scale);
    mesh.castShadow = m.castShadow;
    mesh.receiveShadow = m.receiveShadow;
    mesh.visible = m.visible;
    m.parent?.add(mesh);
    m.removeFromParent();
  }
  return model;
}
