import { type Act, Character, type Env } from './character';
import type { Expression } from './face';
import { sin, swish, trot } from './moves';
import { Spring, wobble } from './spring';

/**
 * A four-legged member of the crew (the cat, the dog). Pets walk in along the frame
 * line, stand, sit and lie down, and stand three-quarters on, turned toward the middle
 * of the window, so their tails show; the head turns most of the way back to you.
 *
 * What a pet feels shows in its tail and ears, each species in its own way: a cat says
 * it with how high she carries her tail, a dog with how hard he wags. A mood table per
 * species says how; hovering, poking, sleep and the mouse pick the mood.
 *
 * The body bone runs from the hips forward, so pitching it turns the body about the
 * hips (- lifts the chest). Children ride on it, so a leg that should stay upright while
 * the body tips gets the opposite turn.
 */
export type Mood =
  'calm' | 'curious' | 'happy' | 'love' | 'alarmed' | 'annoyed' | 'sad' | 'sleepy' | 'asleep';
export type Posture = 'stand' | 'sit' | 'lie';

/** How a mood shows. Angles in degrees, rates in Hz. */
export interface Feeling {
  face: Expression;
  /** How high the tail is carried (+ up from its rest shape), and a slow rise and fall. */
  carriage: number;
  bob?: [degrees: number, hz: number];
  /** Side to side. */
  wag?: [degrees: number, hz: number];
  /** The tip: curled forward (+) or pulled straight (-), quivering, sudden flicks (per s). */
  hook?: number;
  quiver?: number;
  flicks?: number;
  /** Fluffed up like a bottle brush, 0..1. */
  puff?: number;
  /** Ears forward (+) or back (-), out to the sides, and how far they turn after the mouse. */
  ears: number;
  out: number;
  swivel: number;
  /** The whole rear end joins the wag, 0..1. */
  wiggle?: number;
  /** Mouth open, panting, 0..1 (those with a jaw). */
  pant?: number;
}

/** What a species' body is like, and how it shows each mood. */
export interface Anatomy {
  tail: string[];
  /** The first tail bone's direction in character space, for puffing it up. */
  tailAxis: [number, number, number];
  /** Hanging ears (a dog's) swing the opposite way from standing ones (a cat's). */
  earsHang: boolean;
  moods: Record<Mood, Feeling>;
  /** Acts that come with their own mood. */
  actMoods: Record<string, Mood>;
  /** How it feels lying down awake, and when the mouse is over it. */
  lying: Mood;
  hover: Mood;
  /** How far the hips come down for each posture (metres). */
  drop: Record<Posture, number>;
  /** How far sitting tips the body up: the chest rises as much as the hips drop. */
  sit: number;
  /** How far it stands turned from the viewer (degrees): enough for the tail to clear
   * the head and ears. */
  turn: number;
}

const DEG = 180 / Math.PI;
/** How much of a lowered tail's droop each bone takes, root first (longer tails: the last,
 * for every bone after). */
const DROOP = [1, 0.6, 0.3, 0.2];
const droop = (i: number) => DROOP[Math.min(i, DROOP.length - 1)];

export abstract class Pet extends Character {
  mood: Mood = 'calm';
  protected posture: Posture = 'stand';
  protected abstract readonly anatomy: Anatomy;
  protected wagPhase = 0;
  private bobPhase = 0;
  protected crouch = new Spring(2.2, 0.7);
  /** Extra lift of the hips (metres), set each frame by a species that hops or tumbles. */
  protected extraLift = 0;
  /** Off for a pet that is rolling or sliding rather than walking. */
  protected trotting = true;
  protected hop = new Spring(2.5, 0.25);
  private puff = new Spring(4, 0.5);
  private turn = new Spring(0.8, 0.8);
  private nextFlick = 2;
  private pokes: number[] = [];
  private last = { x: 0, y: 0, speed: 0 };

  /** The acts every pet knows; species add their own. */
  protected commonActs(): Record<string, Act> {
    const still = () => !this.walking;
    const standing = () => this.posture === 'stand' && still();
    return {
      idle: { weight: 3, length: [3, 6] },
      stroll: {
        weight: 2,
        length: [3, 5],
        when: standing,
        start: () => {
          const way = Math.random() < 0.5 ? -1 : 1;
          this.walkTo(this.s + way * this.heightPx * (1.5 + Math.random() * 2));
        },
      },
      sit: {
        weight: 3,
        length: [5, 10],
        when: () => this.posture !== 'sit' && still(),
        start: () => (this.posture = 'sit'),
      },
      lie: {
        weight: 1,
        length: [5, 10],
        when: () => this.posture !== 'lie' && still(),
        start: () => (this.posture = 'lie'),
      },
      nap: {
        weight: 1.5,
        length: [8, 18],
        when: still,
        start: () => (this.posture = 'lie'),
      },
      stand: {
        weight: 2,
        length: [0.6, 1],
        when: () => this.posture !== 'stand',
        start: () => (this.posture = 'stand'),
      },
      stretch: {
        weight: 1,
        length: [2.2, 3],
        when: standing,
        pose: () => this.bow(),
      },
      startle: {
        weight: 0,
        length: [1.4, 1.8],
        start: () => {
          this.posture = 'stand';
          this.hop.kick(2.2);
        },
        pose: () => this.puppet.add('body', -8),
      },
    };
  }

  /** A play bow: chest down, front paws out, rump up. */
  protected bow() {
    const p = this.puppet;
    p.add('body', 15);
    p.add('leg.FL', -60);
    p.add('leg.FR', -60);
    p.add('leg.BL', -15);
    p.add('leg.BR', -15);
    p.add('head', -28);
  }

  /** Counts a poke; returns how many came in the last 2.5 seconds. */
  protected poked(time = performance.now() / 1000) {
    this.pokes = [...this.pokes.filter((at) => time - at < 2.5), time];
    const n = this.pokes.length;
    if (n >= 3) this.pokes = [];
    return n;
  }

  protected onEnter() {
    this.posture = 'stand';
    this.puff.snap(0);
  }

  protected onLeave() {
    this.posture = 'stand';
  }

  protected onDirect() {
    this.posture = 'stand';
  }

  /** How it feels right now, from what it's doing, the mouse and being hovered. */
  protected feel(env: Env): Mood {
    const a = this.anatomy;
    if (this.role?.mood) return this.role.mood as Mood;
    if (this.act in a.actMoods) return a.actMoods[this.act];
    if (this.posture === 'lie') return a.lying;
    if (this.hovered) return a.hover;
    const eye = this.eyePoint(env.frame);
    const near = Math.hypot(env.pointer.x - eye.x, env.pointer.y - eye.y) < this.heightPx * 8;
    if (env.pointer.present && near && env.time - env.pointer.at < 1.5) return 'curious';
    return 'calm';
  }

  protected idle(t: number) {
    const p = this.puppet;
    const breath = sin(t, 0.3);
    p.add('body', breath * 1.2);
    p.add('head', 3 * wobble(t * 0.4, 5));
    if (this.posture === 'sit') this.sitting();
    else if (this.posture === 'lie') this.lying(breath);
  }

  /** On its haunches: front legs kept upright, hind legs folded forward under it. */
  protected sitting() {
    const p = this.puppet;
    const tip = this.anatomy.sit;
    p.add('body', tip);
    p.add('leg.FL', -tip);
    p.add('leg.FR', -tip);
    p.add('leg.BL', -75 - tip);
    p.add('leg.BR', -75 - tip);
    p.add('head', -tip);
  }

  /** Lying down with its legs tucked under, head low. */
  protected lying(breath: number) {
    const p = this.puppet;
    p.add('leg.FL', 80);
    p.add('leg.FR', 80);
    p.add('leg.BL', -80);
    p.add('leg.BR', -80);
    p.add('head', 16 + 2 * breath);
  }

  protected pose(dt: number, env: Env) {
    const p = this.puppet;
    const moving = Math.min(1, this.stride / (this.heightPx * 0.8));
    if (moving > 0.05) {
      this.posture = 'stand';
      if (this.trotting) trot(p, this.gait, moving);
    } else if (this.role?.posture) this.posture = this.role.posture;
    const lift =
      this.crouch.update(dt, this.anatomy.drop[this.posture]) +
      Math.max(0, this.hop.update(dt, 0)) +
      this.extraLift;
    p.shift('root', 0, lift, 0);
    const middle = (env.frame.left + env.frame.right) / 2;
    const aside =
      this.walking || this.role?.facing !== undefined
        ? 0
        : Math.sign(middle - this.s) * this.anatomy.turn;
    const turn = this.turn.update(dt, aside);
    p.add('root', 0, turn);
    p.add('head', 0, -turn * 0.7);

    this.mood = this.feel(env);
    const f = this.anatomy.moods[this.mood];
    this.expression = f.face;
    this.tail(dt, env, f);
    this.ears(env, f);
    this.express(dt, env, f);
  }

  /** Species extras for a mood: a jaw that pants, a rear end that wiggles. */
  protected express(_dt: number, _env: Env, _f: Feeling) {}

  private tail(dt: number, env: Env, f: Feeling) {
    const p = this.puppet;
    const bones = this.anatomy.tail;
    // A quick mouse nearby makes a curious pet's tail tip twitch.
    const speed =
      Math.hypot(env.pointer.x - this.last.x, env.pointer.y - this.last.y) / Math.max(dt, 1e-3);
    this.last.x = env.pointer.x;
    this.last.y = env.pointer.y;
    this.last.speed += (speed - this.last.speed) * Math.min(1, dt * 4);
    const eager = this.mood === 'curious' ? Math.min(1, this.last.speed / (this.heightPx * 20)) : 0;

    const [wag, wagHz] = f.wag ?? [0, 0];
    const [bob, bobHz] = f.bob ?? [0, 0];
    this.wagPhase += dt * 2 * Math.PI * wagHz;
    this.bobPhase += dt * 2 * Math.PI * bobHz;
    if (this.posture === 'lie') this.tailLying(f);
    else {
      // Up lifts the tail at the root; down droops it along its length, since a tail
      // that only swings back at the root points away from the viewer and still looks up.
      const c = f.carriage + (this.walking ? 15 : 0) + bob * Math.sin(this.bobPhase);
      bones.forEach((bone, i) => p.add(bone, i === 0 ? c : Math.min(0, c) * droop(i)));
      swish(p, bones, this.wagPhase, wag * (this.walking ? 0.6 : 1));
    }
    const tip = bones[bones.length - 1];
    p.add(tip, f.hook ?? 0);
    if (f.quiver) p.add(tip, f.quiver * 6 * sin(env.time, 7));
    if (Math.random() < ((f.flicks ?? 0) + eager * 2) * dt) {
      p.kick(tip, (Math.random() < 0.5 ? -1 : 1) * 350);
    }
    // Puffed up: the whole tail swells. (Scaling only its girth would shear the bones
    // after the first, which inherit the scale at an angle, and stand the tail up.)
    const puff = 1 + 0.35 * Math.max(0, this.puff.update(dt, f.puff ?? 0));
    p.stretch(bones[0], puff, this.anatomy.tailAxis, puff);
  }

  /** The tail while lying down: low behind it, still showing the mood's wag. */
  protected tailLying(f: Feeling) {
    const [wag] = f.wag ?? [0, 0];
    this.puppet.add(this.anatomy.tail[0], -45);
    swish(this.puppet, this.anatomy.tail, this.wagPhase, wag * 0.6);
  }

  private ears(env: Env, f: Feeling) {
    const p = this.puppet;
    // Turned after the mouse, the nearer ear more.
    let toward = 0;
    if (env.pointer.present && env.time - env.pointer.at < 3) {
      const eye = this.eyePoint(env.frame);
      toward = Math.atan2(env.pointer.x - eye.x, this.heightPx * 3) * DEG;
    }
    const flip = this.anatomy.earsHang ? -1 : 1;
    for (const [ear, side] of [
      ['ear.L', 1],
      ['ear.R', -1],
    ] as const) {
      const near = Math.sign(toward) === side ? 1 : 0.5;
      const turn = Math.max(-45, Math.min(45, toward * f.swivel * near));
      p.add(ear, flip * f.ears, turn, -flip * side * f.out);
    }
    // An ear flick every few seconds, awake or asleep: a knock, and the spring does the rest.
    if (env.time > this.nextFlick) {
      this.nextFlick = env.time + 2 + Math.random() * 5;
      const left = Math.random() < 0.5;
      p.kick(left ? 'ear.L' : 'ear.R', -200 * flip, 0, (left ? -500 : 500) * flip);
    }
  }
}
