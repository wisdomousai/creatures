import type { Object3D } from 'three';
import { Bolt } from './bolt';
import { Cat } from './cat';
import { Clock } from './clock';
import { Dog } from './dog';
import { Duck } from './duck';
import { Hedgehog } from './hedgehog';
import { Ladybug } from './ladybug';
import { Owl } from './owl';
import { Plant } from './plant';
import { Puffer } from './puffer';
import { Sloth } from './sloth';
import {
  type Body,
  type Character,
  type Edge,
  type Env,
  type Frame,
  loadModel,
  type Top,
} from './character';
import { Box, type Door, floorDepth } from './box';
import { type Column, Decor, PAGES } from './decor';
import { DRAG, HOLD, holdSelection, onMenu } from './press';
import { GAMES, Play } from './play';
import { Set as SetPieces, SET_PAGES } from './set';
import { type FlameStyle, glowColour, type LookName } from './looks';
import { Stage } from './stage';
import { setAssets } from './assets';
import { Vacuum } from './vacuum';
import { Bunny } from './bunny';
import { Cactus } from './cactus';
import { Octopus } from './octopus';
import { Bear } from './bear';
import { Fox } from './fox';
import { Kitten } from './kitten';
import { Scamp } from './scamp';
import { Koi } from './koi';
import { Squirrel } from './squirrel';
import { Raven } from './raven';
import { Shorthair } from './shorthair';
import { Fatcat } from './fatcat';
import { Siamese } from './siamese';
import { Mainecoon } from './mainecoon';
import { Sphynx } from './sphynx';
import { Persian } from './persian';
import { Scottishfold } from './scottishfold';
import { Swan } from './swan';
import { Poodle } from './poodle';
import { Dachshund } from './dachshund';
import { Puppy } from './puppy';
import { Greatdane } from './greatdane';
import { Corgi } from './corgi';
import { Husky } from './husky';
import { Chihuahua } from './chihuahua';
import { Labrador } from './labrador';
import { Greyhound } from './greyhound';
import { Saintbernard } from './saintbernard';
import { Pug } from './pug';
import { Bordercollie } from './bordercollie';
import { Beagle } from './beagle';
import { Macaw } from './macaw';
import { Bat } from './bat';
import { Drone } from './drone';
import { Crawler } from './crawler';
import { Penguin } from './penguin';
import { Unicycle } from './unicycle';
import { Pogo } from './pogo';
import { Nova } from './nova';
import { Snail } from './snail';
import { Lizard } from './lizard';
import { Tang } from './tang';
import { Turtle } from './turtle';
import { Tortoise } from './tortoise';
import { Bengal } from './bengal';
import { Ragdoll } from './ragdoll';
import { Abyssinian } from './abyssinian';
import { Munchkin } from './munchkin';
import { Oldtabby } from './oldtabby';
import { Hummingbird } from './hummingbird';
import { Flamingo } from './flamingo';
import { Toucan } from './toucan';
import { Robin } from './robin';
import { Hen } from './hen';
import { Cow } from './cow';
import { Unicorn } from './unicorn';
import { Lamb } from './lamb';
import { Alpaca } from './alpaca';
import { Piglet } from './piglet';
import { Tigercub } from './tigercub';
import { Elephant } from './elephant';
import { Frog } from './frog';
import { Monkey } from './monkey';
import { Chameleon } from './chameleon';
import { Bee } from './bee';
import { Butterfly } from './butterfly';
import { Caterpillar } from './caterpillar';
import { Beetle } from './beetle';
import { Firefly } from './firefly';
import { Hamster } from './hamster';
import { Chinchilla } from './chinchilla';
import { Koala } from './koala';
import { Panda } from './panda';
import { RedPanda } from './redpanda';
import { Tin } from './tin';
import { Tot } from './tot';
import { Teapot } from './teapot';
import { Lanky } from './lanky';
import { Skater } from './skater';
import { Panther } from './panther';
import { Jackson } from './jackson';
import { Pygmy } from './pygmy';
import { Parson } from './parson';
import { Jellyfish } from './jellyfish';
import { Seahorse } from './seahorse';
import { Narwhal } from './narwhal';
import { Crab } from './crab';
import { Otter } from './otter';
import { Foal } from './foal';
import { Ram } from './ram';
import { HighlandCalf } from './highlandcalf';
import { Rooster } from './rooster';
import { Goose } from './goose';
import { Goat } from './goat';
import { Donkey } from './donkey';
import { GuineaPig } from './guineapig';
import { Ferret } from './ferret';
import { Chick } from './chick';
import { Slinky } from './slinky';
import { Hexapod } from './hexapod';
import { Ballbot } from './ballbot';
import { Camerabot } from './camerabot';
import { Djbot } from './djbot';
import { Raccoon } from './raccoon';
import { Beaver } from './beaver';
import { PolarCub } from './polarcub';
import { Mouse } from './mouse';
import { Fawn } from './fawn';
import { Moth } from './moth';
import { Dragonfly } from './dragonfly';
import { JumpingSpider } from './jumpingspider';
import { Ant } from './ant';
import { Grasshopper } from './grasshopper';
import { Capybara } from './capybara';
import { Wombat } from './wombat';
import { Quokka } from './quokka';
import { Fennec } from './fennec';
import { Snowleopard } from './snowleopard';
import { Anglerfish } from './anglerfish';
import { Hermitcrab } from './hermitcrab';
import { Dolphin } from './dolphin';
import { Clownfish } from './clownfish';
import { Mantisshrimp } from './mantisshrimp';
import { Gardener } from './gardener';
import { Astronaut } from './astronaut';
import { Painter } from './painter';
import { Juggler } from './juggler';
import { Knight } from './knight';
import { Starfish } from './starfish';
import { Manta } from './manta';
import { Axolotl } from './axolotl';
import { SealPup } from './sealpup';
import { BabyWhale } from './babywhale';
import { PygmyHippo } from './pygmyhippo';
import { Tapir } from './tapir';
import { Gorilla } from './gorilla';
import { Lemur } from './lemur';
import { Python } from './python';

/**
 * The crew on the window frame: who is on stage, when the next one turns up, and where.
 * Each comes when it likes, stays a while and goes; at most a few are out at once, and
 * they keep out of each other's way along the frame line.
 */
type Maker = (model: Object3D) => Character;
export interface Member {
  file: string;
  make: Maker;
  /** How often it turns up, relative to the others. */
  weight: number;
}

/** Something else in the box that dresses in the crew's look and moves every frame (the
 * monitor in the middle). */
export interface Fixture {
  dress(look: LookName): void;
  update(dt: number, env: Env): void;
}

/** Three clicks on a crewmate within this many ms send it out (slower ones are pokes). */
const TRIPLE = 700;
/** Poked again within this long (ms): a trick. */
const AGAIN = 5000;

export const ROSTER: Record<string, Member> = {
  bolt: { file: 'bolt.glb', make: (m) => new Bolt(m), weight: 3 },
  cat: { file: 'cat.glb', make: (m) => new Cat(m), weight: 3 },
  dog: { file: 'dog.glb', make: (m) => new Dog(m), weight: 3 },
  ladybug: { file: 'ladybug.glb', make: (m) => new Ladybug(m), weight: 3 },
  duck: { file: 'duck.glb', make: (m) => new Duck(m), weight: 3 },
  plant: { file: 'plant.glb', make: (m) => new Plant(m), weight: 3 },
  vacuum: { file: 'vacuum.glb', make: (m) => new Vacuum(m), weight: 3 },
  clock: { file: 'clock.glb', make: (m) => new Clock(m), weight: 2 },
  sloth: { file: 'sloth.glb', make: (m) => new Sloth(m), weight: 3 },
  hedgehog: { file: 'hedgehog.glb', make: (m) => new Hedgehog(m), weight: 3 },
  owl: { file: 'owl.glb', make: (m) => new Owl(m), weight: 3 },
  cactus: { file: 'cactus.glb', make: (m) => new Cactus(m), weight: 3 },
  octopus: { file: 'octopus.glb', make: (m) => new Octopus(m), weight: 3 },
  bear: { file: 'bear.glb', make: (m) => new Bear(m), weight: 3 },
  bunny: { file: 'bunny.glb', make: (m) => new Bunny(m), weight: 3 },
  fox: { file: 'fox.glb', make: (m) => new Fox(m), weight: 3 },
  puffer: { file: 'puffer.glb', make: (m) => new Puffer(m), weight: 3 },
  kitten: { file: 'kitten.glb', make: (m) => new Kitten(m), weight: 3 },
  scamp: { file: 'scamp.glb', make: (m) => new Scamp(m), weight: 3 },
  koi: { file: 'koi.glb', make: (m) => new Koi(m), weight: 3 },
  squirrel: { file: 'squirrel.glb', make: (m) => new Squirrel(m), weight: 3 },
  raven: { file: 'raven.glb', make: (m) => new Raven(m), weight: 3 },
  shorthair: { file: 'shorthair.glb', make: (m) => new Shorthair(m), weight: 3 },
  fatcat: { file: 'fatcat.glb', make: (m) => new Fatcat(m), weight: 3 },
  swan: { file: 'swan.glb', make: (m) => new Swan(m), weight: 3 },
  poodle: { file: 'poodle.glb', make: (m) => new Poodle(m), weight: 3 },
  dachshund: { file: 'dachshund.glb', make: (m) => new Dachshund(m), weight: 3 },
  puppy: { file: 'puppy.glb', make: (m) => new Puppy(m), weight: 3 },
  macaw: { file: 'macaw.glb', make: (m) => new Macaw(m), weight: 3 },
  bat: { file: 'bat.glb', make: (m) => new Bat(m), weight: 3 },
  drone: { file: 'drone.glb', make: (m) => new Drone(m), weight: 3 },
  crawler: { file: 'crawler.glb', make: (m) => new Crawler(m), weight: 3 },
  penguin: { file: 'penguin.glb', make: (m) => new Penguin(m), weight: 3 },
  unicycle: { file: 'unicycle.glb', make: (m) => new Unicycle(m), weight: 3 },
  pogo: { file: 'pogo.glb', make: (m) => new Pogo(m), weight: 3 },
  tin: { file: 'tin.glb', make: (m) => new Tin(m), weight: 2 },
  tot: { file: 'tot.glb', make: (m) => new Tot(m), weight: 2 },
  teapot: { file: 'teapot.glb', make: (m) => new Teapot(m), weight: 2 },
  lanky: { file: 'lanky.glb', make: (m) => new Lanky(m), weight: 3 },
  skater: { file: 'skater.glb', make: (m) => new Skater(m), weight: 3 },
  nova: { file: 'nova.glb', make: (m) => new Nova(m), weight: 3 },
  snail: { file: 'snail.glb', make: (m) => new Snail(m), weight: 3 },
  lizard: { file: 'lizard.glb', make: (m) => new Lizard(m), weight: 3 },
  // Only for the cookie question (art/robot/site/cookies.ts): never on his own.
  tang: { file: 'tang.glb', make: (m) => new Tang(m), weight: 0 },
  turtle: { file: 'turtle.glb', make: (m) => new Turtle(m), weight: 3 },
  tortoise: { file: 'tortoise.glb', make: (m) => new Tortoise(m), weight: 3 },
  greatdane: { file: 'greatdane.glb', make: (m) => new Greatdane(m), weight: 3 },
  corgi: { file: 'corgi.glb', make: (m) => new Corgi(m), weight: 3 },
  husky: { file: 'husky.glb', make: (m) => new Husky(m), weight: 3 },
  chihuahua: { file: 'chihuahua.glb', make: (m) => new Chihuahua(m), weight: 3 },
  labrador: { file: 'labrador.glb', make: (m) => new Labrador(m), weight: 3 },
  siamese: { file: 'siamese.glb', make: (m) => new Siamese(m), weight: 3 },
  mainecoon: { file: 'mainecoon.glb', make: (m) => new Mainecoon(m), weight: 3 },
  sphynx: { file: 'sphynx.glb', make: (m) => new Sphynx(m), weight: 3 },
  persian: { file: 'persian.glb', make: (m) => new Persian(m), weight: 3 },
  scottishfold: { file: 'scottishfold.glb', make: (m) => new Scottishfold(m), weight: 3 },
  greyhound: { file: 'greyhound.glb', make: (m) => new Greyhound(m), weight: 3 },
  saintbernard: { file: 'saintbernard.glb', make: (m) => new Saintbernard(m), weight: 3 },
  pug: { file: 'pug.glb', make: (m) => new Pug(m), weight: 3 },
  bordercollie: { file: 'bordercollie.glb', make: (m) => new Bordercollie(m), weight: 3 },
  beagle: { file: 'beagle.glb', make: (m) => new Beagle(m), weight: 3 },
  bengal: { file: 'bengal.glb', make: (m) => new Bengal(m), weight: 3 },
  ragdoll: { file: 'ragdoll.glb', make: (m) => new Ragdoll(m), weight: 3 },
  abyssinian: { file: 'abyssinian.glb', make: (m) => new Abyssinian(m), weight: 3 },
  munchkin: { file: 'munchkin.glb', make: (m) => new Munchkin(m), weight: 3 },
  oldtabby: { file: 'oldtabby.glb', make: (m) => new Oldtabby(m), weight: 3 },
  hummingbird: { file: 'hummingbird.glb', make: (m) => new Hummingbird(m), weight: 3 },
  flamingo: { file: 'flamingo.glb', make: (m) => new Flamingo(m), weight: 3 },
  toucan: { file: 'toucan.glb', make: (m) => new Toucan(m), weight: 3 },
  robin: { file: 'robin.glb', make: (m) => new Robin(m), weight: 3 },
  hen: { file: 'hen.glb', make: (m) => new Hen(m), weight: 3 },
  cow: { file: 'cow.glb', make: (m) => new Cow(m), weight: 3 },
  unicorn: { file: 'unicorn.glb', make: (m) => new Unicorn(m), weight: 3 },
  lamb: { file: 'lamb.glb', make: (m) => new Lamb(m), weight: 3 },
  alpaca: { file: 'alpaca.glb', make: (m) => new Alpaca(m), weight: 3 },
  piglet: { file: 'piglet.glb', make: (m) => new Piglet(m), weight: 3 },
  tigercub: { file: 'tigercub.glb', make: (m) => new Tigercub(m), weight: 3 },
  elephant: { file: 'elephant.glb', make: (m) => new Elephant(m), weight: 3 },
  frog: { file: 'frog.glb', make: (m) => new Frog(m), weight: 3 },
  monkey: { file: 'monkey.glb', make: (m) => new Monkey(m), weight: 3 },
  chameleon: { file: 'chameleon.glb', make: (m) => new Chameleon(m), weight: 3 },
  bee: { file: 'bee.glb', make: (m) => new Bee(m), weight: 3 },
  butterfly: { file: 'butterfly.glb', make: (m) => new Butterfly(m), weight: 3 },
  caterpillar: { file: 'caterpillar.glb', make: (m) => new Caterpillar(m), weight: 3 },
  firefly: { file: 'firefly.glb', make: (m) => new Firefly(m), weight: 3 },
  beetle: { file: 'beetle.glb', make: (m) => new Beetle(m), weight: 3 },
  hamster: { file: 'hamster.glb', make: (m) => new Hamster(m), weight: 3 },
  chinchilla: { file: 'chinchilla.glb', make: (m) => new Chinchilla(m), weight: 3 },
  redpanda: { file: 'redpanda.glb', make: (m) => new RedPanda(m), weight: 3 },
  koala: { file: 'koala.glb', make: (m) => new Koala(m), weight: 3 },
  panda: { file: 'panda.glb', make: (m) => new Panda(m), weight: 3 },
  panther: { file: 'panther.glb', make: (m) => new Panther(m), weight: 3 },
  jackson: { file: 'jackson.glb', make: (m) => new Jackson(m), weight: 3 },
  pygmy: { file: 'pygmy.glb', make: (m) => new Pygmy(m), weight: 3 },
  parson: { file: 'parson.glb', make: (m) => new Parson(m), weight: 3 },
  jellyfish: { file: 'jellyfish.glb', make: (m) => new Jellyfish(m), weight: 3 },
  seahorse: { file: 'seahorse.glb', make: (m) => new Seahorse(m), weight: 3 },
  narwhal: { file: 'narwhal.glb', make: (m) => new Narwhal(m), weight: 3 },
  crab: { file: 'crab.glb', make: (m) => new Crab(m), weight: 3 },
  otter: { file: 'otter.glb', make: (m) => new Otter(m), weight: 3 },
  foal: { file: 'foal.glb', make: (m) => new Foal(m), weight: 3 },
  ram: { file: 'ram.glb', make: (m) => new Ram(m), weight: 3 },
  highlandcalf: { file: 'highlandcalf.glb', make: (m) => new HighlandCalf(m), weight: 3 },
  rooster: { file: 'rooster.glb', make: (m) => new Rooster(m), weight: 3 },
  goose: { file: 'goose.glb', make: (m) => new Goose(m), weight: 3 },
  goat: { file: 'goat.glb', make: (m) => new Goat(m), weight: 3 },
  donkey: { file: 'donkey.glb', make: (m) => new Donkey(m), weight: 3 },
  guineapig: { file: 'guineapig.glb', make: (m) => new GuineaPig(m), weight: 3 },
  ferret: { file: 'ferret.glb', make: (m) => new Ferret(m), weight: 3 },
  chick: { file: 'chick.glb', make: (m) => new Chick(m), weight: 3 },
  slinky: { file: 'slinky.glb', make: (m) => new Slinky(m), weight: 3 },
  hexapod: { file: 'hexapod.glb', make: (m) => new Hexapod(m), weight: 3 },
  ballbot: { file: 'ballbot.glb', make: (m) => new Ballbot(m), weight: 3 },
  camerabot: { file: 'camerabot.glb', make: (m) => new Camerabot(m), weight: 3 },
  djbot: { file: 'djbot.glb', make: (m) => new Djbot(m), weight: 3 },
  raccoon: { file: 'raccoon.glb', make: (m) => new Raccoon(m), weight: 3 },
  beaver: { file: 'beaver.glb', make: (m) => new Beaver(m), weight: 3 },
  polarcub: { file: 'polarcub.glb', make: (m) => new PolarCub(m), weight: 3 },
  mouse: { file: 'mouse.glb', make: (m) => new Mouse(m), weight: 3 },
  fawn: { file: 'fawn.glb', make: (m) => new Fawn(m), weight: 3 },
  moth: { file: 'moth.glb', make: (m) => new Moth(m), weight: 3 },
  dragonfly: { file: 'dragonfly.glb', make: (m) => new Dragonfly(m), weight: 3 },
  jumpingspider: { file: 'jumpingspider.glb', make: (m) => new JumpingSpider(m), weight: 3 },
  ant: { file: 'ant.glb', make: (m) => new Ant(m), weight: 3 },
  grasshopper: { file: 'grasshopper.glb', make: (m) => new Grasshopper(m), weight: 3 },
  capybara: { file: 'capybara.glb', make: (m) => new Capybara(m), weight: 3 },
  wombat: { file: 'wombat.glb', make: (m) => new Wombat(m), weight: 3 },
  quokka: { file: 'quokka.glb', make: (m) => new Quokka(m), weight: 3 },
  fennec: { file: 'fennec.glb', make: (m) => new Fennec(m), weight: 3 },
  snowleopard: { file: 'snowleopard.glb', make: (m) => new Snowleopard(m), weight: 3 },
  anglerfish: { file: 'anglerfish.glb', make: (m) => new Anglerfish(m), weight: 3 },
  hermitcrab: { file: 'hermitcrab.glb', make: (m) => new Hermitcrab(m), weight: 3 },
  dolphin: { file: 'dolphin.glb', make: (m) => new Dolphin(m), weight: 3 },
  clownfish: { file: 'clownfish.glb', make: (m) => new Clownfish(m), weight: 3 },
  mantisshrimp: { file: 'mantisshrimp.glb', make: (m) => new Mantisshrimp(m), weight: 3 },
  gardener: { file: 'gardener.glb', make: (m) => new Gardener(m), weight: 3 },
  astronaut: { file: 'astronaut.glb', make: (m) => new Astronaut(m), weight: 3 },
  painter: { file: 'painter.glb', make: (m) => new Painter(m), weight: 3 },
  juggler: { file: 'juggler.glb', make: (m) => new Juggler(m), weight: 3 },
  knight: { file: 'knight.glb', make: (m) => new Knight(m), weight: 3 },
  starfish: { file: 'starfish.glb', make: (m) => new Starfish(m), weight: 3 },
  manta: { file: 'manta.glb', make: (m) => new Manta(m), weight: 3 },
  axolotl: { file: 'axolotl.glb', make: (m) => new Axolotl(m), weight: 3 },
  sealpup: { file: 'sealpup.glb', make: (m) => new SealPup(m), weight: 3 },
  babywhale: { file: 'babywhale.glb', make: (m) => new BabyWhale(m), weight: 3 },
  pygmyhippo: { file: 'pygmyhippo.glb', make: (m) => new PygmyHippo(m), weight: 3 },
  tapir: { file: 'tapir.glb', make: (m) => new Tapir(m), weight: 3 },
  gorilla: { file: 'gorilla.glb', make: (m) => new Gorilla(m), weight: 3 },
  lemur: { file: 'lemur.glb', make: (m) => new Lemur(m), weight: 3 },
  python: { file: 'python.glb', make: (m) => new Python(m), weight: 3 },
};

export interface CrewOptions {
  canvas: HTMLCanvasElement;
  /** Folder the models are served from, ending in a slash. */
  models: string;
  /** Where the invisible hit areas go (a fixed, full-window layer). */
  hits: HTMLElement;
  /**
   * 'auto' follows the page: ink robots on light paper, paper robots on dark (the page's
   * data-theme if it sets one, else the colour scheme).
   */
  look?: LookName | 'auto';
  flame?: FlameStyle;
  /** At most this many on stage. */
  max?: number;
  /** Who may come by themselves (and be called in for a game); defaults to everyone.
   * Anyone can still be called by name. */
  roster?: string[];
  /** Seconds between arrivals, picked at random between the two. */
  every?: [number, number];
  /** Reads the frame (defaults to the site's --frame-inset and --bot). */
  frame?: () => Frame;
  /** Draw the frame as the open front of a shallow box (on unless false). */
  box?: boolean;
  /** What hangs from the box's ceiling on each page (see page()). */
  pages?: Record<string, string[]>;
  /** The page's content in viewport px, which the decorations keep clear of (defaults to
   * <main>'s content box). */
  clear?: () => Column | null;
  /** Is this one out of sight behind something on the page (a sheet of paper in the
   * box)? Then clicks go through it to what is in front. */
  behind?: (c: Character) => boolean;
  /** Called every frame just before the scene is drawn: the page's own moving parts, so
   * what they hide lines up with where they are this frame. */
  tick?: (dt: number, frame: Frame) => void;
}

export class Crew {
  readonly stage: Stage;
  readonly members = new Map<string, Character>();
  readonly box: Box | null;
  readonly decor: Decor | null;
  /** The props, and the little scenes the crew play with them. */
  readonly play: Play | null;
  /** The living set pieces in the back of the box: a fern, a lamp, an armchair. */
  readonly set: SetPieces | null;
  /** Anything else on the floor the crew walk round (the monitor's seat). */
  readonly obstacles: Body[] = [];
  /** The tops of anything else a flier can come down onto (the monitor's), when it's there. */
  readonly tops: ((f: Frame) => Top | null)[] = [];
  /** How far back in the box anyone (and anything) goes: up to the monitor, never behind
   * it (the page keeps it there; the frame carries it to them all). */
  back = 1;
  private opts: Required<Omit<CrewOptions, 'frame' | 'behind' | 'tick'>> &
    Pick<CrewOptions, 'behind' | 'tick'> & { frame: () => Frame };
  frame: Frame;
  private pointer = { x: -1, y: -1, at: -100, present: false };
  private hitAreas = new Map<Character, HTMLElement>();
  /** A right-click (or a long press) on one of them: the page may offer it a menu (its
   * tricks), and says whether it did. */
  onMenu: ((member: Character, at: { x: number; y: number }) => boolean) | null = null;
  private loading = new Set<string>();
  private fixtures: Fixture[] = [];
  private nextCall = 1.5;
  private last = 0;
  private time = 0;
  private dark = matchMedia('(prefers-color-scheme: dark)');
  private cleanup: (() => void)[] = [];
  /** Something happening that everyone turns to look at, for a moment (see watch()). */
  private show: { point: () => { x: number; y: number } | null; until: number; at: number } | null =
    null;

  constructor(options: CrewOptions) {
    this.opts = {
      look: 'auto',
      flame: 'beacon',
      max: 3,
      roster: Object.keys(ROSTER),
      every: [6, 18],
      frame: () => readFrame(),
      box: true,
      pages: PAGES,
      clear: () => readColumn(),
      ...options,
    };
    setAssets(this.opts.models);
    this.stage = new Stage(options.canvas);
    this.box = this.opts.box ? new Box(options.canvas) : null;
    this.decor = this.box
      ? new Decor(this.stage.scene, this.box, this.opts.models, options.hits, this.opts.clear)
      : null;
    this.play = this.box
      ? new Play(this.stage.scene, this.box, this.opts.models, options.hits, (n) =>
          this.opts.roster.includes(n) ? this.call(n) : Promise.resolve(null),
        )
      : null;
    this.set = this.box
      ? new SetPieces(this.stage.scene, this.box, this.opts.models, options.hits)
      : null;
    if (this.set)
      this.set.warm = (parts) => {
        const { renderer, camera, scene } = this.stage;
        for (const o of parts) void renderer.compileAsync(o, camera, scene);
      };
    this.frame = this.opts.frame();
    this.resize();
    const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(type, fn, { passive: true });
      this.cleanup.push(() => window.removeEventListener(type, fn));
    };
    on('resize', () => this.resize());
    on('pointermove', (e) => {
      this.pointer = { x: e.clientX, y: e.clientY, at: this.time, present: true };
    });
    const out = () => (this.pointer.present = false);
    document.documentElement.addEventListener('pointerleave', out);
    this.cleanup.push(() => document.documentElement.removeEventListener('pointerleave', out));
    const restyle = () => {
      this.members.forEach((m) => m.dress(this.look, this.opts.flame));
      this.decor?.dress(this.look);
      this.play?.dress(this.look);
      this.set?.dress(this.look);
      this.set?.theme(this.darkPage);
      this.box?.theme(this.darkPage);
      this.fixtures.forEach((f) => f.dress(this.look));
    };
    restyle();
    this.dark.addEventListener('change', restyle);
    this.cleanup.push(() => this.dark.removeEventListener('change', restyle));
    const theme = new MutationObserver(restyle);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    this.cleanup.push(() => theme.disconnect());
  }

  /** Whether the page is dark: its data-theme if it sets one, else the colour scheme. */
  private get darkPage() {
    const theme = document.documentElement.dataset.theme;
    return theme ? theme === 'dark' : this.dark.matches;
  }

  get look(): LookName {
    return this.opts.look === 'auto' ? (this.darkPage ? 'paper' : 'ink') : this.opts.look;
  }

  /** The look asked for ('auto' follows the page). */
  get lookChosen(): LookName | 'auto' {
    return this.opts.look ?? 'auto';
  }

  set look(look: LookName | 'auto') {
    this.opts.look = look;
    this.members.forEach((m) => m.dress(this.look, this.opts.flame));
    this.decor?.dress(this.look);
    this.play?.dress(this.look);
    this.set?.dress(this.look);
    this.fixtures.forEach((f) => f.dress(this.look));
  }

  set flame(flame: FlameStyle) {
    this.opts.flame = flame;
    this.members.forEach((m) => m.dress(this.look, flame));
  }

  set max(max: number) {
    this.opts.max = max;
  }

  get max() {
    return this.opts.max;
  }

  /** Who may come by themselves (a playground's family, say). */
  set roster(names: string[]) {
    this.opts.roster = names;
  }

  get roster(): readonly string[] {
    return this.opts.roster;
  }

  /** How often others come by themselves (s, from..to): the next one comes within it. */
  set every(every: [number, number]) {
    this.opts.every = every;
    this.nextCall = every[0] + Math.random() * (every[1] - every[0]);
  }

  /** The one colour of every light, eye and beacon at rest (null: the look's own). */
  set glow(colour: string | null) {
    glowColour.value = colour;
    this.look = this.opts.look;
  }

  start() {
    this.last = performance.now();
    this.stage.renderer.setAnimationLoop((now) => this.tick(now));
  }

  stop() {
    this.stage.renderer.setAnimationLoop(null);
  }

  dispose() {
    this.stop();
    this.cleanup.forEach((fn) => fn());
    this.members.forEach((m) => m.dispose());
    this.hitAreas.forEach((el) => el.remove());
    this.decor?.dispose();
    this.play?.dispose();
    this.set?.dispose();
    this.box?.dispose();
    this.stage.dispose();
  }

  /** Put something else in the box (the monitor): dressed and moved with the crew. */
  add(fixture: Fixture) {
    this.fixtures.push(fixture);
    fixture.dress(this.look);
  }

  /** Is this one on its way (its model loading)? */
  coming(name: string) {
    return this.loading.has(name);
  }

  /** Bring someone on now (the lab's buttons), or the next one due (from the roster); `on`
   * an edge of its own (a wall, the ceiling), if it has that one, and where along it; and,
   * walking in, from which end of it (else either; or up from below the front lip there)
   * and how far back it keeps; or in by that door. */
  async call(
    name?: string,
    on?: {
      edge?: Edge;
      s?: number;
      from?: 'start' | 'end' | 'below';
      depth?: number;
      door?: Door;
    },
  ): Promise<Character | null> {
    const onStage = this.onStage();
    const free = Object.keys(ROSTER).filter(
      (n) => !this.loading.has(n) && !onStage.some((c) => c === this.members.get(n)),
    );
    name ??= pick(
      free.filter((n) => this.opts.roster.includes(n)),
      (n) => ROSTER[n].weight,
    );
    if (!name || !free.includes(name)) return null;
    this.loading.add(name);
    try {
      const member = await this.load(name);
      const edge = on?.edge && member.spec.edges.includes(on.edge) ? on.edge : undefined;
      const door = on?.door ?? (edge ? null : this.door(member));
      if (door) {
        member.enterBy(this.frame, door);
        return member;
      }
      const spot = edge && on?.s !== undefined ? { edge, s: on.s } : this.spot(member, edge);
      if (!spot) return null;
      member.enter(this.frame, spot.edge, spot.s, on?.from, on?.depth);
      return member;
    } finally {
      this.loading.delete(name);
    }
  }

  /**
   * Bring one on by jumping out of its picture on the glass (the Creatures page), whoever
   * may come by themselves: its feet at `at()` (viewport px, read once it's loaded; null if
   * the picture has gone) on the glass `depth` back, down to the floor in front. With the
   * stage full, the one that has been here longest goes. One that doesn't jump (a flier, a
   * swimmer) comes its own way.
   */
  async jumpOut(
    name: string,
    at: () => { x: number; y: number } | null,
    depth: number,
  ): Promise<Character | null> {
    if (!ROSTER[name] || this.loading.has(name)) return null;
    const out = this.members.get(name);
    if (out && out.state !== 'gone') return out;
    const crowd = this.onStage().filter((m) => m.state !== 'leaving');
    if (crowd.length >= this.opts.max) {
      const longest = crowd.filter((m) => !m.role).sort((a, b) => b.t - a.t)[0];
      longest?.leave();
    }
    this.loading.add(name);
    try {
      const member = await this.load(name);
      const p = at();
      const f = this.frame;
      if (!p || !member.jumpsOut || !member.spec.edges.includes('bottom')) {
        const spot = this.spot(member);
        if (!spot) return null;
        member.enter(f, spot.edge, spot.s);
        return member;
      }
      // Down in front of where it was, a little to one side, clear of the frame's corners.
      const margin = f.bot * 1.2 + member.footprint(f).x;
      const s = Math.min(
        Math.max(p.x + (Math.random() - 0.5) * f.bot * 2, f.left + margin),
        f.right - margin,
      );
      member.jumpOut(f, p, depth, s, 0.15 + Math.random() * 0.2);
      return member;
    } finally {
      this.loading.delete(name);
    }
  }

  /** One of the crew, its model loaded and dressed the first time it's wanted. */
  private async load(name: string) {
    let member = this.members.get(name);
    if (member) return member;
    const model = await loadModel(this.opts.models + ROSTER[name].file);
    member = ROSTER[name].make(model);
    member.dress(this.look, this.opts.flame);
    this.stage.scene.add(member.holder);
    member.doors = this.box?.doors ?? [];
    this.members.set(name, member);
    this.hitArea(member);
    return member;
  }

  /** A new page: its decorations come down from the ceiling, the last page's go up, and
   * its set pieces come in; a playground has its own games. */
  page(name: string) {
    this.decor?.show(this.opts.pages[name] ?? [], this.frame);
    this.set?.show(SET_PAGES[name] ?? [], this.frame);
    this.play?.favour(GAMES[name] ?? []);
  }

  /**
   * Something is happening there (a page going by, a cord pulled): everyone turns to look
   * for a while, each a beat after the last. `point` is read every frame, in viewport px.
   */
  watch(point: { x: number; y: number } | (() => { x: number; y: number } | null), seconds = 2.5) {
    const read = typeof point === 'function' ? point : () => point;
    this.show = { point: read, at: this.time, until: this.time + seconds };
  }

  /** Send everyone (or one) off. */
  dismiss(name?: string) {
    for (const [n, m] of this.members) if (!name || n === name) m.leave();
  }

  poke(name: string) {
    this.members.get(name)?.poke();
  }

  private onStage() {
    return [...this.members.values()].filter((m) => m.state !== 'gone');
  }

  /**
   * Now and then a free door for it to come in by, on a floor (or ceiling) it lives on,
   * with room in front of it.
   */
  private door(member: Character): Door | null {
    if (!this.box || member.spec.entrance === 'fly' || Math.random() > 0.6) return null;
    const f = this.frame;
    const others = this.onStage().filter((m) => m !== member);
    const doors = this.box.doors.filter((d) => {
      if (d.user || !member.spec.edges.includes(d.edge)) return false;
      if (member.doorKinds && !member.doorKinds.includes(d.kind)) return false;
      const fp = member.footprint(f);
      const out = d.spots(fp).outside;
      // Not one a set piece stands in front of (the library's cases stand by the walls).
      const deep = floorDepth(f);
      const barred = (p: Body) => {
        const at = p.floorPoint(f);
        const r = p.footprint(f);
        return (
          Math.abs(out.s - at.x) < r.x + fp.x && Math.abs(out.depth * deep - at.z) < r.z + fp.z
        );
      };
      if (d.edge === 'bottom' && this.set?.bodies.some((p) => p.blocks?.(member) && barred(p)))
        return false;
      member.edge = d.edge;
      member.s = out.s;
      member.depth = out.depth;
      const clear = others.every(
        (o) => o.free || o.edge !== d.edge || member.spaceTo(o, f).n > 1.3,
      );
      member.depth = 0;
      return clear;
    });
    return doors[Math.floor(Math.random() * doors.length)] ?? null;
  }

  /** A free place on one of its edges (or that one), clear of the others. */
  private spot(member: Character, only?: Edge): { edge: Edge; s: number } | null {
    const f = this.frame;
    const others = this.onStage().filter((m) => m !== member);
    for (let attempt = 0; attempt < 24; attempt++) {
      const edge = only ?? member.spec.edges[Math.floor(Math.random() * member.spec.edges.length)];
      const horizontal = edge === 'bottom' || edge === 'top';
      const [lo, hi] = horizontal ? [f.left, f.right] : [f.top, f.bottom];
      const margin =
        f.bot * 1.2 + (member.spec.width / member.spec.metres) * member.spec.size * f.bot;
      if (hi - lo < margin * 2) continue;
      const s = lo + margin + Math.random() * (hi - lo - margin * 2);
      // Clear of everyone on that edge: where it comes up, and where it steps back to.
      member.edge = edge;
      member.s = s;
      const clear = [0, 0.2].every((depth) => {
        member.depth = depth;
        return others.every((o) => o.free || o.edge !== edge || member.spaceTo(o, f).n > 1.2);
      });
      member.depth = 0;
      if (clear) return { edge, s };
    }
    return null;
  }

  private hitArea(member: Character) {
    const el = document.createElement('div');
    el.className = 'robot-hit';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText =
      'position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;display:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none;';
    el.addEventListener('pointerenter', () => (member.hovered = true));
    el.addEventListener('pointerleave', () => (member.hovered = false));
    onMenu(el, (at) => !!this.onMenu?.(member, at));
    // Pressed on and held (or dragged): taken up, and after the pointer till it's let go;
    // the click that ends it does nothing else.
    let press: { id: number; x: number; y: number; timer: number } | null = null;
    let took = false;
    const takeUp = (id: number, at: { x: number; y: number }) => {
      if (press) clearTimeout(press.timer);
      press = null;
      if (!member.takeUp(at, this.frame)) return;
      took = true;
      try {
        el.setPointerCapture(id);
      } catch {
        // (Already let go.)
      }
      el.style.cursor = 'grabbing';
    };
    const putDown = () => {
      if (press) clearTimeout(press.timer);
      press = null;
      if (!member.isHeld) return;
      member.putDown(this.frame);
      el.style.cursor = 'pointer';
    };
    el.addEventListener('pointerdown', (e) => {
      took = false;
      if (e.button !== 0) return;
      holdSelection();
      const at = { x: e.clientX, y: e.clientY };
      const timer =
        e.pointerType === 'touch' ? 0 : window.setTimeout(() => takeUp(e.pointerId, at), HOLD);
      press = { id: e.pointerId, ...at, timer };
    });
    el.addEventListener('pointermove', (e) => {
      const at = { x: e.clientX, y: e.clientY };
      if (press?.id === e.pointerId && Math.hypot(at.x - press.x, at.y - press.y) > DRAG)
        takeUp(e.pointerId, { x: press.x, y: press.y });
      member.dragTo(at);
    });
    el.addEventListener('pointerup', putDown);
    el.addEventListener('pointercancel', putDown);
    el.addEventListener('lostpointercapture', putDown);
    // A click pokes it, and again within a few seconds of the last it does a trick, any
    // of them; three in quick succession send it out.
    let clicks: number[] = [];
    let poked = -Infinity;
    el.addEventListener('click', (e) => {
      if (took) {
        took = false;
        return;
      }
      clicks = [...clicks.filter((t) => e.timeStamp - t < TRIPLE), e.timeStamp];
      if (clicks.length >= 3) {
        clicks = [];
        return member.leave();
      }
      const again = e.timeStamp - poked < AGAIN;
      poked = e.timeStamp;
      if (again) member.trick();
      else member.poke();
    });
    this.opts.hits.appendChild(el);
    this.hitAreas.set(member, el);
  }

  private resize() {
    this.frame = { ...this.opts.frame(), back: this.back };
    this.stage.resize(window.innerWidth, window.innerHeight);
    const radius = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--frame-radius'),
    );
    this.box?.update(this.frame, window.innerWidth, window.innerHeight, radius || 0);
  }

  private tick(now: number) {
    const dt = Math.min((now - this.last) / 1000, 1 / 20);
    this.last = now;
    this.time += dt;
    const onStage = this.onStage();
    if (onStage.length < this.opts.max && this.loading.size === 0) {
      this.nextCall -= dt;
      if (this.nextCall <= 0) {
        this.nextCall =
          this.opts.every[0] + Math.random() * (this.opts.every[1] - this.opts.every[0]);
        void this.call();
      }
    }
    this.box?.tick(dt);
    this.frame.back = this.back;
    const env: Env = {
      frame: this.frame,
      pointer: this.pointer,
      time: this.time,
      crew: onStage,
      props: [...(this.play?.props ?? []), ...(this.set?.bodies ?? []), ...this.obstacles],
      tops: [
        ...(this.set?.tops(this.frame) ?? []),
        ...(this.decor?.tops(this.frame) ?? []),
        ...this.tops.flatMap((top) => top(this.frame) ?? []),
      ],
    };
    if (this.show && this.time < this.show.until) {
      const p = this.show.point();
      if (p) env.show = { ...p, at: this.show.at };
    } else this.show = null;
    for (const m of onStage) m.update(dt, env);
    this.decor?.update(dt, env);
    this.play?.update(dt, env);
    this.set?.update(dt, env);
    for (const f of this.fixtures) f.update(dt, env);
    for (const [m, el] of this.hitAreas) {
      if (m.state === 'gone') {
        el.style.display = 'none';
        continue;
      }
      const b = m.bounds(this.frame);
      el.style.display = 'block';
      // (Held, it's still held, wherever it's got to.)
      el.style.pointerEvents = this.opts.behind?.(m) && !m.isHeld ? 'none' : 'auto';
      el.style.transform = `translate(${b.x}px, ${b.y}px)`;
      el.style.width = `${b.w}px`;
      el.style.height = `${b.h}px`;
    }
    this.opts.tick?.(dt, this.frame);
    this.stage.render();
  }
}

/** The site's frame, from its CSS custom properties (see global.css). */
export function readFrame(): Frame {
  const css = getComputedStyle(document.documentElement);
  const inset = parseFloat(css.getPropertyValue('--frame-inset')) || 10;
  const bot = parseFloat(css.getPropertyValue('--bot')) || 28;
  return {
    left: inset,
    top: inset,
    right: window.innerWidth - inset,
    bottom: window.innerHeight - inset,
    band: bot,
    bot,
    depth: bot * 0.8,
  };
}

/** <main>'s content box, in viewport px. */
function readColumn(): Column | null {
  const main = document.querySelector('main');
  if (!main) return null;
  const r = main.getBoundingClientRect();
  const css = getComputedStyle(main);
  return {
    left: r.left + parseFloat(css.paddingLeft),
    right: r.right - parseFloat(css.paddingRight),
    top: r.top + parseFloat(css.paddingTop),
  };
}

function pick<T>(items: T[], weight: (t: T) => number): T | undefined {
  let r = Math.random() * items.reduce((s, i) => s + weight(i), 0);
  for (const i of items) if ((r -= weight(i)) <= 0) return i;
  return items[items.length - 1];
}
