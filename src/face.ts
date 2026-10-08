import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';

/**
 * A crew member's face: glowing shapes on a black screen, drawn on a canvas that the
 * screen shows as its emissive map. The shapes and layouts match face_pixels() in
 * blender/faces.py, so the Blender previews and the site agree.
 *
 * Only redraws when something visible changes.
 */
export const EXPRESSIONS = [
  'neutral',
  'happy',
  'surprised',
  'love',
  'wink',
  'sleepy',
  'asleep',
  'dizzy',
  'focused',
  'sad',
  'cross',
  'starry',
  'sheepish',
  'determined',
] as const;
export type Expression = (typeof EXPRESSIONS)[number];

/**
 * Where things sit on a screen, as fractions of its width and height. Bolt's is the
 * default; the crew's smaller screens set their own.
 */
export interface FaceLayout {
  width: number;
  height: number;
  /** Eye centres: the character's right eye first (the viewer's left). */
  eyes: [number, number][];
  /** Eye radii and line weight, as fractions of the width (ry of the height). */
  rx: number;
  ry: number;
  line: number;
  /** Mouth centre, or null for a face without one. */
  mouth: [number, number] | null;
  /** A cat's nose and ω mouth, or a clock dial (ticks and the real time) behind the eyes. */
  kind?: 'cat' | 'dial' | 'girl';
  /** Pupil radius as a fraction of the eye's smaller radius (0.5 unless set). */
  pupil?: number;
}

export const BOLT_FACE: FaceLayout = {
  width: 512,
  height: 320,
  eyes: [
    [0.34, 0.46],
    [0.66, 0.46],
  ],
  rx: 0.075,
  ry: 0.2,
  line: 0.03,
  mouth: [0.5, 0.72],
};

/** A little picture drawn on the screen: a heart, star or flower, drawn `progress` of the way. */
export interface Doodle {
  shape: 'heart' | 'star' | 'flower';
  /** 0..1 of the outline drawn so far. */
  progress: number;
  /** Alone on the screen (the face steps aside) rather than beside the face. */
  solo: boolean;
  /** Centre as fractions of the width and height, and size as a fraction of the height. */
  at: [number, number];
  size: number;
  /** Filled in (a kiss) rather than an outline. */
  fill?: boolean;
}

/** The outline of a doodle in unit coordinates (y down), as a polyline. */
function doodleOutline(shape: Doodle['shape']): [number, number][] {
  const pts: [number, number][] = [];
  if (shape === 'star') {
    for (let i = 0; i <= 5; i++) {
      const a = ((i * 4) / 5) * Math.PI - Math.PI / 2;
      pts.push([Math.cos(a), Math.sin(a)]);
    }
    // A five-point star drawn in one stroke, skipping a point each time.
  } else if (shape === 'heart') {
    for (let i = 0; i <= 48; i++) {
      const t = ((i / 48) * 2 + 1) * Math.PI;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push([x / 17, -(y + 2) / 17]);
    }
  } else {
    // A five-petal rose curve.
    for (let i = 0; i <= 120; i++) {
      const t = (i / 120) * 4 * Math.PI;
      const r = Math.cos(2.5 * t);
      pts.push([r * Math.cos(t), r * Math.sin(t)]);
    }
  }
  return pts;
}

export class Face {
  readonly texture: CanvasTexture;
  expression: Expression = 'neutral';
  /** Where the eyes look, -1..1 each way (x to the viewer's right, y down). */
  look = { x: 0, y: 0 };
  /** 0 open, 1 shut. */
  blink = 0;
  /**
   * A cat's pupils: 0 a narrow slit, 1 wide and round (excited, hunting, in the dark).
   * Startled, they go wide whatever this says.
   */
  dilate = 0;
  /** 0 closed, 1 wide: the mouth while talking. */
  talk = 0;
  /** A picture being drawn on the screen (Nova's star, heart and flower), or none. */
  doodle: Doodle | null = null;
  /** A symbol on the screen between the eyes: question marks (lost for words) or a lightbulb (an idea). */
  mark: 'none' | 'question' | 'bulb' = 'none';
  /** Something drawn over the eyes: little round glasses, or a bubble (overlayK 0..1 is its size). */
  overlay: '' | 'glasses' | 'bubble' = '';
  overlayK = 0;
  /** Minutes a dial runs ahead of the real time (a clock whizzes its hands when dizzy). */
  dialShift = 0;
  private ctx: CanvasRenderingContext2D;
  private glow: string;
  private drawn = '';
  private nextBlink = 2;
  private blinkAt = -1;

  readonly layout: FaceLayout;

  constructor(glow = '#f4f4f1', layout: FaceLayout = BOLT_FACE) {
    this.layout = layout;
    const canvas = document.createElement('canvas');
    canvas.width = layout.width;
    canvas.height = layout.height;
    this.ctx = canvas.getContext('2d')!;
    this.glow = glow;
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.flipY = false; // glTF UVs start at the top left
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
  }

  setGlow(glow: string) {
    this.glow = glow;
    this.drawn = '';
  }

  /** Blinks on its own; call every frame with the running time in seconds. */
  update(time: number) {
    const blinks = ['neutral', 'focused', 'sad', 'cross'].includes(this.expression);
    if (blinks && time > this.nextBlink) {
      this.blinkAt = time;
      // Mostly single blinks, now and then a double.
      this.nextBlink = time + (Math.random() < 0.2 ? 0.35 : 2 + Math.random() * 4);
    }
    const b = time - this.blinkAt;
    this.blink = blinks && b < 0.16 ? Math.sin((b / 0.16) * Math.PI) : 0;
    // Animated faces redraw on a clock: drifting z's, spinning spirals.
    const z =
      {
        asleep: Math.floor(time * 6),
        dizzy: Math.floor(time * 15),
        starry: Math.floor(time * 5),
      }[this.expression as string] ?? 0;
    // A dial shows the real time, so it redraws when the minute changes.
    const minute =
      this.layout.kind === 'dial' ? Math.floor(Date.now() / 60000 + this.dialShift) : 0;
    const key = [
      this.expression,
      this.glow,
      Math.round(this.look.x * 20),
      Math.round(this.look.y * 20),
      Math.round(this.blink * 4),
      Math.round(this.talk * 4),
      this.mark,
      this.mark === 'none' ? 0 : Math.floor(time * 8),
      Math.round(this.dilate * 8),
      z,
      minute,
      this.doodle
        ? [
            this.doodle.shape,
            Math.round(this.doodle.progress * 60),
            this.doodle.solo,
            this.doodle.at,
            this.doodle.size,
          ].join()
        : '',
      this.overlay,
      Math.round(this.overlayK * 12),
    ].join();
    if (key !== this.drawn) {
      this.drawn = key;
      this.draw(time);
      this.texture.needsUpdate = true;
    }
  }

  private draw(time: number) {
    const c = this.ctx;
    const L = this.layout;
    const W = L.width;
    const H = L.height;
    const RX = L.rx * W;
    const RY = L.ry * H;
    const LINE = L.line * W;
    const EYES = L.eyes.map(([x, y]) => [x * W, y * H] as [number, number]);
    const MOUTH: [number, number] = L.mouth ? [L.mouth[0] * W, L.mouth[1] * H] : [0, 0];
    const hasMouth = !!L.mouth;
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, H);
    c.fillStyle = c.strokeStyle = this.glow;
    c.lineCap = c.lineJoin = 'round';
    const dx = this.look.x * RX * 0.67;
    const dy = this.look.y * RY * 0.3;
    const eyes = EYES.map(([x, y]) => [x + dx, y + dy] as [number, number]);
    const mouth: [number, number] = [MOUTH[0] + dx * 0.5, MOUTH[1] + dy * 0.4];

    const ellipse = ([x, y]: [number, number], rx: number, ry: number) => {
      c.beginPath();
      c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      c.fill();
    };
    const arc = (
      [x, y]: [number, number],
      rx: number,
      ry: number,
      a0: number,
      a1: number,
      w: number,
    ) => {
      c.lineWidth = w;
      c.beginPath();
      c.ellipse(x, y, rx, ry, 0, a0 * Math.PI, a1 * Math.PI);
      c.stroke();
    };
    if (L.kind === 'dial') this.dial(W, H, LINE);
    const catMouth = () => {
      // A small nose, and ω under it.
      ellipse([mouth[0], mouth[1] - 0.06 * H], 0.025 * W, 0.03 * H);
      for (const s of [-1, 1])
        arc([mouth[0] + s * 0.03 * W, mouth[1]], 0.03 * W, 0.05 * H, 0.1, 0.9, LINE * 0.8);
    };
    const smile = (big = false) =>
      !hasMouth
        ? undefined
        : this.talk > 0.05
          ? ellipse([mouth[0], mouth[1] + 0.01 * H], 0.04 * W, 0.015 * H + this.talk * 0.06 * H)
          : L.kind === 'cat'
            ? catMouth()
            : big
              ? arc([mouth[0], mouth[1] - 0.02 * H], 0.075 * W, 0.1 * H, 0.12, 0.88, LINE * 1.1)
              : arc(mouth, 0.055 * W, 0.07 * H, 0.15, 0.85, LINE * 0.85);
    const frown = () => {
      if (!hasMouth) return;
      if (L.kind === 'cat') ellipse([mouth[0], mouth[1] - 0.06 * H], 0.025 * W, 0.03 * H);
      arc([mouth[0], mouth[1] + 0.09 * H], 0.05 * W, 0.06 * H, 1.15, 1.85, LINE * 0.85);
    };
    // A girl's lashes: three flicks up and out from the eye's outer corner (side -1 is the
    // viewer's left). `shown` is the eye's open height, so a blink shortens them.
    const lashes = ([x, y]: [number, number], rx: number, ry: number, side: number, shown = ry) => {
      if (L.kind !== 'girl') return;
      c.lineWidth = LINE * 0.75;
      for (const t of [0.35, 0.72, 1.08]) {
        const p0 = [x + side * rx * Math.cos(t) * 1.02, y - shown * Math.sin(t) * 1.02];
        const d = [side * Math.cos(t), -Math.sin(t) * 1.25];
        const len = (ry * 0.42) / Math.hypot(d[0], d[1]);
        c.beginPath();
        c.moveTo(p0[0], p0[1]);
        c.lineTo(p0[0] + d[0] * len, p0[1] + d[1] * len);
        c.stroke();
      }
    };
    const happyEye = ([x, y]: [number, number]) =>
      arc([x, y + RY * 0.3], RX * 0.95, RY * 0.55, 1.1, 1.9, LINE);
    const closedEye = ([x, y]: [number, number]) =>
      arc([x, y - RY * 0.15], RX * 0.95, RY * 0.35, 0.1, 0.9, LINE);
    // A dark pupil in a glowing eye, a glint on it, looking the way the eyes look. It is
    // clipped to the eye as drawn (blinking, sleepy, under a brow), so lids cut it too.
    const pupil = (
      [x, y]: [number, number],
      rx: number,
      ry: number,
      shown = ry,
      size = 1,
      drop = 0,
    ) => {
      const r = Math.min(rx, ry) * (L.pupil ?? 0.5) * size;
      // A cat's is an upright ellipse nearly the height of the eye, from a slit to
      // nearly round; everyone else's is round.
      const wide = this.expression === 'surprised' ? 1 : this.dilate;
      const [prx, pry] =
        L.kind === 'cat' ? [rx * (0.2 + 0.5 * wide) * size, ry * (0.8 - 0.1 * wide)] : [r, r];
      // A tall pupil moves less sideways, or the eye's curve would cut it.
      const px = x + this.look.x * (rx - prx) * (L.kind === 'cat' ? 0.25 : 0.55);
      const py = y + (drop + this.look.y * 0.55 * (1 - drop)) * (ry - pry);
      c.save();
      c.beginPath();
      c.ellipse(x, y, rx, shown, 0, 0, Math.PI * 2);
      c.clip();
      c.fillStyle = '#000';
      ellipse([px, py], prx, pry);
      c.fillStyle = this.glow;
      ellipse([px - r * 0.3, py - r * 0.45], r * 0.24, r * 0.24);
      c.restore();
    };
    const openEye = (e: [number, number], ry = RY) => {
      if (this.blink > 0.7) return closedEye(e);
      const shown = Math.max(ry * (1 - this.blink), RY * 0.1);
      ellipse(e, RX, shown);
      pupil(e, RX, ry, shown);
      lashes(e, RX, ry, e[0] < W / 2 ? -1 : 1, shown);
    };
    const heart = ([x, y]: [number, number], s: number) => {
      c.beginPath();
      c.moveTo(x, y + s * 0.95);
      c.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.8, y - s * 1.2, x, y - s * 0.45);
      c.bezierCurveTo(x + s * 0.8, y - s * 1.2, x + s * 1.5, y - s * 0.1, x, y + s * 0.95);
      c.fill();
    };

    const doodle = this.doodle;
    if (doodle?.solo) return this.paintDoodle(doodle, W, H, LINE);
    switch (this.expression) {
      case 'neutral':
        eyes.forEach((e) => openEye(e));
        smile();
        break;
      case 'focused':
        eyes.forEach((e) => openEye([e[0], e[1] + RY * 0.15], RY * 0.6));
        if (hasMouth)
          arc([mouth[0], mouth[1] + 0.02 * H], 0.03 * W, 0.03 * H, 0.15, 0.85, LINE * 0.8);
        break;
      case 'sad':
        eyes.forEach((e) => openEye([e[0], e[1] + RY * 0.2], RY * 0.8));
        if (hasMouth)
          arc([mouth[0], mouth[1] + 0.09 * H], 0.05 * W, 0.06 * H, 1.15, 1.85, LINE * 0.85);
        break;
      case 'cross':
        // Eyes cut by a brow that slopes down toward the middle of the face.
        eyes.forEach(([x, y], i) => {
          const inner = i === 0 ? 1 : -1;
          const brow = (px: number) => y - RY * 0.3 + inner * (px - x) * ((0.55 * RY) / RX);
          c.save();
          c.beginPath();
          c.moveTo(x - RX * 1.2, brow(x - RX * 1.2));
          c.lineTo(x + RX * 1.2, brow(x + RX * 1.2));
          c.lineTo(x + RX * 1.2, y + RY * 2);
          c.lineTo(x - RX * 1.2, y + RY * 2);
          c.clip();
          openEye([x, y]);
          c.restore();
        });
        frown();
        break;
      case 'happy':
        eyes.forEach(happyEye);
        smile(true);
        break;
      case 'surprised':
        // Wide eyes, small pupils.
        eyes.forEach((e) => {
          ellipse(e, RX * 1.13, RY * 0.63);
          pupil(e, RX * 1.13, RY * 0.63, RY * 0.63, L.kind === 'cat' ? 1 : 0.6);
          lashes(e, RX * 1.13, RY * 0.63, e[0] < W / 2 ? -1 : 1);
        });
        if (hasMouth) arc([mouth[0], mouth[1] + 0.04 * H], 0.028 * W, 0.042 * H, 0, 2, LINE * 0.8);
        break;
      case 'love':
        eyes.forEach((e) => heart(e, RX * 0.93));
        smile(true);
        break;
      case 'wink':
        openEye(eyes[0]);
        happyEye(eyes[1]);
        smile(true);
        break;
      case 'sleepy':
        eyes.forEach(([x, y]) => {
          c.save();
          c.beginPath();
          c.rect(0, y + RY * 0.1, W, H);
          c.clip();
          ellipse([x, y], RX, RY * 0.75);
          // Heavy lids: the pupils sit low.
          pupil([x, y], RX, RY * 0.75, RY * 0.75, 1, 0.55);
          c.restore();
        });
        if (hasMouth) {
          c.lineWidth = LINE * 0.8;
          c.beginPath();
          c.moveTo(mouth[0] - 0.03 * W, mouth[1] + 0.03 * H);
          c.lineTo(mouth[0] + 0.03 * W, mouth[1] + 0.03 * H);
          c.stroke();
        }
        break;
      case 'asleep': {
        eyes.forEach(closedEye);
        // Little z's float up the screen's top right corner.
        c.font = `700 ${RY * 0.45}px ui-monospace, monospace`;
        const top = EYES[EYES.length - 1];
        for (let i = 0; i < 3; i++) {
          const k = (time * 0.35 + i / 3) % 1;
          c.globalAlpha = Math.sin(k * Math.PI);
          c.fillText('z', top[0] + RX * 1.6 + k * RX * 0.8, top[1] - RY * 0.6 - k * RY * 1.3);
        }
        c.globalAlpha = 1;
        break;
      }
      case 'starry': {
        // Sparkly star eyes that twinkle, over a big open smile.
        const star = ([x, y]: [number, number], r: number) => {
          c.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            const k = i % 2 ? 0.45 : 1;
            c.lineTo(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k * 1.05);
          }
          c.closePath();
          c.fill();
        };
        const pulse = 1 + 0.09 * Math.sin(time * 9);
        eyes.forEach((e, i) => star(e, RY * 0.78 * (i ? 2 - pulse : pulse)));
        if (hasMouth)
          arc([mouth[0], mouth[1] - 0.03 * H], 0.08 * W, 0.1 * H, 0.08, 0.92, LINE * 1.1);
        break;
      }
      case 'sheepish': {
        // Eyes cast down and aside under heavy lids, a wobbly little mouth, a sweat drop.
        eyes.forEach(([x, y]) => {
          c.save();
          c.beginPath();
          c.rect(0, y - RY * 0.15, W, H);
          c.clip();
          ellipse([x, y + RY * 0.1], RX, RY * 0.8);
          pupil([x, y + RY * 0.1], RX, RY * 0.8, RY * 0.8, 1, 0.5);
          c.restore();
        });
        if (hasMouth) {
          c.lineWidth = LINE * 0.8;
          c.beginPath();
          for (let i = 0; i <= 20; i++) {
            const k = i / 20;
            c.lineTo(
              mouth[0] - 0.05 * W + k * 0.1 * W,
              mouth[1] + 0.04 * H + Math.sin(k * 2.5 * Math.PI) * 0.014 * H,
            );
          }
          c.stroke();
        }
        const dx0 = EYES[EYES.length - 1][0] + RX * 1.7;
        const dy0 = EYES[EYES.length - 1][1] - RY * 0.9;
        c.beginPath();
        c.moveTo(dx0, dy0 - RY * 0.38);
        c.quadraticCurveTo(dx0 + RX * 0.55, dy0 + RY * 0.1, dx0, dy0 + RY * 0.22);
        c.quadraticCurveTo(dx0 - RX * 0.55, dy0 + RY * 0.1, dx0, dy0 - RY * 0.38);
        c.fill();
        break;
      }
      case 'determined':
        // Level brows cutting the eyes flat, and a firm short mouth.
        eyes.forEach(([x, y], i) => {
          const inner = i === 0 ? 1 : -1;
          const brow = (px: number) => y - RY * 0.35 + inner * (px - x) * ((0.22 * RY) / RX);
          c.save();
          c.beginPath();
          c.moveTo(x - RX * 1.2, brow(x - RX * 1.2));
          c.lineTo(x + RX * 1.2, brow(x + RX * 1.2));
          c.lineTo(x + RX * 1.2, y + RY * 2);
          c.lineTo(x - RX * 1.2, y + RY * 2);
          c.clip();
          openEye([x, y + RY * 0.05], RY * 0.95);
          c.restore();
        });
        if (hasMouth) {
          c.lineWidth = LINE * 0.95;
          c.beginPath();
          c.moveTo(mouth[0] - 0.045 * W, mouth[1] + 0.005 * H);
          c.lineTo(mouth[0] + 0.045 * W, mouth[1] - 0.005 * H);
          c.stroke();
        }
        break;
      case 'dizzy':
        eyes.forEach(([x, y]) => {
          c.lineWidth = LINE * 0.7;
          c.beginPath();
          for (let i = 0; i <= 80; i++) {
            const t = (i / 80) * 3.5 * Math.PI + Math.floor(time * 15) * 0.4;
            const k = i / 80;
            c.lineTo(x + RX * k * Math.cos(t), y + RX * 0.92 * k * Math.sin(t));
          }
          c.stroke();
        });
        if (hasMouth) {
          c.lineWidth = LINE * 0.7;
          c.beginPath();
          for (let i = 0; i <= 40; i++) {
            const k = i / 40;
            c.lineTo(
              mouth[0] - 0.06 * W + k * 0.12 * W,
              mouth[1] + 0.03 * H + Math.sin(k * 3 * Math.PI) * 0.02 * H,
            );
          }
          c.stroke();
        }
        break;
    }
    if (this.overlay === 'glasses') {
      c.lineWidth = LINE * 0.55;
      for (const [x, y] of eyes) {
        c.beginPath();
        c.ellipse(x, y, RX * 1.4, Math.min(RY * 1.2, H * 0.47), 0, 0, Math.PI * 2);
        c.stroke();
      }
      c.beginPath();
      c.moveTo(eyes[0][0] + RX * 1.4, eyes[0][1]);
      c.quadraticCurveTo(
        (eyes[0][0] + eyes[1][0]) / 2,
        eyes[0][1] - RY * 0.35,
        eyes[1][0] - RX * 1.4,
        eyes[1][1],
      );
      c.stroke();
    } else if (this.overlay === 'bubble' && this.overlayK > 0.02) {
      // A bubble rising from the mouth: a ring with a glint.
      const r = Math.min(RY, H * 0.3) * 0.8 * this.overlayK;
      const bx = W / 2 + RX * 0.2;
      const by = H * 0.78 - r * 0.4;
      c.lineWidth = LINE * 0.5;
      c.beginPath();
      c.arc(bx, by, r, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(bx, by, r * 0.68, Math.PI * 1.1, Math.PI * 1.55);
      c.stroke();
    }
    if (doodle) this.paintDoodle(doodle, W, H, LINE);
    if (this.mark !== 'none') this.drawMark(time, W, H, LINE);
  }

  /** A doodle, drawn as far as its progress says (or filled, for a kiss). */
  private paintDoodle(d: Doodle, W: number, H: number, line: number) {
    const c = this.ctx;
    const [cx, cy] = [d.at[0] * W, d.at[1] * H];
    const size = d.size * H;
    const pts = doodleOutline(d.shape).map(([x, y]) => [cx + x * size, cy + y * size]);
    c.lineWidth = line * 1.1;
    if (d.fill) {
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.fill();
      return;
    }
    const upTo = d.progress * (pts.length - 1);
    c.beginPath();
    pts.forEach(([x, y], i) => {
      if (i <= upTo) return i ? c.lineTo(x, y) : c.moveTo(x, y);
      if (i - 1 < upTo) {
        const f = upTo - (i - 1);
        const [px, py] = pts[i - 1];
        c.lineTo(px + (x - px) * f, py + (y - py) * f);
      }
    });
    c.stroke();
    if (d.shape === 'flower' && d.progress > 0.98) {
      c.beginPath();
      c.arc(cx, cy, size * 0.12, 0, Math.PI * 2);
      c.fill();
    }
  }

  /** A question mark or a lightbulb in the gap between the eyes. */
  private drawMark(time: number, W: number, H: number, line: number) {
    const c = this.ctx;
    c.fillStyle = c.strokeStyle = this.glow;
    if (this.mark === 'question') {
      c.font = `700 ${H * 0.5}px ui-monospace, monospace`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('?', W / 2, H * 0.42 + Math.sin(time * 6) * H * 0.03);
      c.textAlign = 'start';
      c.textBaseline = 'alphabetic';
      return;
    }
    const [x, y, r] = [W / 2, H * 0.34, H * 0.12];
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.fillRect(x - r * 0.5, y + r * 0.95, r, r * 0.5);
    c.lineWidth = line * 0.6;
    c.lineCap = 'round';
    const lit = Math.floor(time * 8) % 2;
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (1.12 + (i / 6) * 0.76);
      const [r0, r1] = [r * 1.35, r * (i % 2 === lit ? 1.85 : 1.65)];
      c.beginPath();
      c.moveTo(x + r0 * Math.cos(a), y + r0 * Math.sin(a));
      c.lineTo(x + r1 * Math.cos(a), y + r1 * Math.sin(a));
      c.stroke();
    }
  }

  /** A clock face: hour ticks round the rim and hands at the real time. */
  private dial(W: number, H: number, line: number) {
    const c = this.ctx;
    const [cx, cy] = [W / 2, H / 2];
    const ray = (a: number, r0: number, r1: number, w: number) => {
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(cx + r0 * Math.sin(a), cy - r0 * Math.cos(a));
      c.lineTo(cx + r1 * Math.sin(a), cy - r1 * Math.cos(a));
      c.stroke();
    };
    for (let i = 0; i < 12; i++)
      ray((i / 12) * 2 * Math.PI, (i % 3 ? 0.36 : 0.33) * W, 0.41 * W, line * (i % 3 ? 0.8 : 1.1));
    const now = new Date(Date.now() + this.dialShift * 60000);
    const minutes = now.getMinutes();
    const hours = (now.getHours() % 12) + minutes / 60;
    ray((hours / 12) * 2 * Math.PI, 0, 0.2 * W, line * 1.2);
    ray((minutes / 60) * 2 * Math.PI, 0, 0.3 * W, line * 0.8);
  }

  dispose() {
    this.texture.dispose();
  }
}
