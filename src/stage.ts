import {
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { outlineUniforms } from './looks';

/**
 * One transparent canvas over the whole window. World units are CSS pixels: x to the
 * right, y up (world y = -viewport y), the robots near z = 0. A narrow perspective camera
 * sits far back, so the z = 0 plane lines up with the page pixel for pixel and the
 * robots still read as solid objects.
 */
const FOV = 12;
const WHITE = new Color(0xffffff);
const WARM = new Color(0xffc68f);
/** The rim from behind, by firelight: a little moonlight at the window. */
const COOL = new Color(0xbfd0ff);

export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(FOV, 1, 1, 10);
  width = 1;
  height = 1;
  private lights: [HemisphereLight, DirectionalLight, DirectionalLight];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.localClippingEnabled = true; // robots rise from behind the frame line
    // Soft studio light, as in the Blender previews: a bright sky, a key from the upper
    // left, and a rim from behind so ink robots don't melt into their shadows.
    const key = new DirectionalLight(0xffffff, 2.4);
    key.position.set(-0.55, 0.75, 1);
    const rim = new DirectionalLight(0xffffff, 1.4);
    rim.position.set(0.5, 0.6, -1);
    const sky = new HemisphereLight(0xffffff, 0x9a9a94, 1.9);
    this.lights = [sky, key, rim];
    this.scene.add(sky, key, rim);
  }

  /**
   * The room's light: `level` of the studio light (1 as it is), and how `warm` (0 white, 1
   * the colour of a fire and a reading lamp).
   */
  mood(level: number, warm = 0) {
    const [sky, key, rim] = this.lights;
    sky.intensity = 1.9 * level;
    key.intensity = 2.4 * level;
    rim.intensity = 1.4 * (0.4 + 0.6 * level);
    sky.color.copy(WHITE).lerp(WARM, warm);
    key.color.copy(WHITE).lerp(WARM, warm);
    rim.color.copy(WHITE).lerp(COOL, warm * 0.5);
  }

  resize(width: number, height: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    const d = height / 2 / Math.tan(((FOV / 2) * Math.PI) / 180);
    this.camera.aspect = width / height;
    this.camera.position.set(width / 2, -height / 2, d);
    this.camera.near = d / 4;
    this.camera.far = d * 4;
    this.camera.lookAt(width / 2, -height / 2, 0);
    this.camera.updateProjectionMatrix();
    outlineUniforms.viewport.value.set(width * dpr, height * dpr);
    outlineUniforms.outlinePx.value = 1.1 * dpr;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
  }
}
