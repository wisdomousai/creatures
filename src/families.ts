/**
 * Who is who in the crew, for the Creatures page and its playgrounds and for the play
 * scenes that want a dog or a cat: each one's name, what it is, and its family. The
 * name is the one in its spec (the spec only comes with the model, and the page shows
 * everyone before any of them is loaded).
 */
export type Family =
  'cat' | 'dog' | 'bird' | 'fluffy' | 'farm' | 'jungle' | 'sea' | 'bug' | 'robot' | 'other';

export interface Card {
  name: string;
  /** What it is, in a word or two. */
  what: string;
  family: Family;
  /**
   * The tools that suit its body and character (tools.ts), by name, besides the signs, which
   * anyone with a way to hold one may. A creature without a list holds nothing else: the wave
   * that gives each its tools adds them here, one line at a time.
   */
  tools?: string[];
}

export const CARDS: Record<string, Card> = {
  cat: { name: 'Pixel', what: 'Cat', family: 'cat', tools: ['balloon', 'magnifier', 'umbrella'] },
  kitten: { name: 'Bit', what: 'Kitten', family: 'cat' },
  scamp: { name: 'Scamp', what: 'Lanky kitten', family: 'cat' },
  shorthair: { name: 'Bun', what: 'British shorthair', family: 'cat' },
  fatcat: { name: 'Waddles', what: 'Fat cat', family: 'cat' },
  siamese: { name: 'Suki', what: 'Siamese', family: 'cat' },
  mainecoon: { name: 'Moose', what: 'Maine Coon', family: 'cat' },
  sphynx: { name: 'Ember', what: 'Sphynx', family: 'cat' },
  persian: { name: 'Pearl', what: 'Old Persian', family: 'cat' },
  scottishfold: { name: 'Pudding', what: 'Scottish Fold kitten', family: 'cat' },
  bengal: { name: 'Roz', what: 'Bengal', family: 'cat' },
  ragdoll: { name: 'Mochi', what: 'Ragdoll', family: 'cat' },
  abyssinian: { name: 'Tansy', what: 'Abyssinian', family: 'cat' },
  munchkin: { name: 'Nub', what: 'Munchkin kitten', family: 'cat' },
  oldtabby: { name: 'Gus', what: 'Old tabby', family: 'cat' },
  dog: { name: 'Byte', what: 'Dog', family: 'dog' },
  poodle: { name: 'Chrome', what: 'Poodle', family: 'dog' },
  dachshund: { name: 'Link', what: 'Dachshund', family: 'dog' },
  puppy: { name: 'Pip', what: 'Puppy', family: 'dog' },
  greatdane: { name: 'Duke', what: 'Great Dane', family: 'dog' },
  corgi: { name: 'Toast', what: 'Corgi', family: 'dog' },
  husky: { name: 'Koda', what: 'Husky', family: 'dog' },
  chihuahua: { name: 'Taco', what: 'Chihuahua', family: 'dog' },
  labrador: { name: 'Maple', what: 'Old Labrador', family: 'dog' },
  greyhound: { name: 'Wisp', what: 'Greyhound', family: 'dog' },
  saintbernard: { name: 'Bruno', what: 'Saint Bernard', family: 'dog' },
  pug: { name: 'Nugget', what: 'Pug', family: 'dog' },
  bordercollie: { name: 'Scout', what: 'Border collie', family: 'dog' },
  beagle: { name: 'Penny', what: 'Beagle puppy', family: 'dog' },
  owl: { name: 'Hoot', what: 'Owl', family: 'bird', tools: ['lantern', 'map', 'telescope'] },
  duck: { name: 'Rivet', what: 'Wind-up duck', family: 'bird' },
  raven: { name: 'Nib', what: 'Raven', family: 'bird' },
  swan: { name: 'Grace', what: 'Swan', family: 'bird' },
  macaw: { name: 'Coco', what: 'Scarlet macaw', family: 'bird' },
  penguin: { name: 'Waddle', what: 'Penguin', family: 'bird' },
  hummingbird: { name: 'Zip', what: 'Hummingbird', family: 'bird' },
  flamingo: { name: 'Flo', what: 'Flamingo', family: 'bird' },
  toucan: { name: 'Mango', what: 'Toucan', family: 'bird' },
  robin: { name: 'Cheep', what: 'Robin', family: 'bird' },
  hen: { name: 'Biddy', what: 'Hen', family: 'bird' },
  bolt: {
    name: 'Bolt',
    what: 'Rocket-booted robot',
    family: 'robot',
    tools: ['flag', 'lantern', 'magnifier', 'map', 'megaphone', 'telescope', 'umbrella'],
  },
  nova: { name: 'Nova', what: 'Robot girl', family: 'robot' },
  ladybug: { name: 'Dot', what: 'Ladybug', family: 'bug' },
  plant: { name: 'Sprout', what: 'Houseplant', family: 'other' },
  cactus: { name: 'Burr', what: 'Cactus', family: 'other' },
  vacuum: { name: 'Zoom', what: 'Robot vacuum', family: 'robot' },
  clock: { name: 'Tick', what: 'Alarm clock', family: 'robot' },
  drone: { name: 'Whirr', what: 'Hover drone', family: 'robot' },
  crawler: { name: 'Tread', what: 'Crawler', family: 'robot' },
  unicycle: { name: 'Uno', what: 'Unicyclist', family: 'robot' },
  pogo: { name: 'Boing', what: 'Pogo-hopper', family: 'robot' },
  sloth: { name: 'Lag', what: 'Sloth', family: 'jungle' },
  hedgehog: { name: 'Quill', what: 'Hedgehog', family: 'fluffy' },
  bear: { name: 'Bearing', what: 'Teddy bear', family: 'fluffy' },
  bunny: { name: 'Pogo', what: 'Bunny', family: 'fluffy' },
  fox: { name: 'Vix', what: 'Fox', family: 'fluffy' },
  squirrel: { name: 'Chip', what: 'Squirrel', family: 'fluffy' },
  bat: { name: 'Ping', what: 'Bat', family: 'other' },
  lizard: { name: 'Flick', what: 'Gecko', family: 'jungle' },
  snail: { name: 'Helix', what: 'Snails', family: 'bug' },
  turtle: { name: 'Flip', what: 'Sea turtle', family: 'sea' },
  tortoise: { name: 'Ohm', what: 'Tortoise', family: 'other' },
  octopus: { name: 'Coil', what: 'Octopus', family: 'sea' },
  puffer: { name: 'Bloop', what: 'Pufferfish', family: 'sea' },
  koi: { name: 'Blip', what: 'Koi', family: 'sea' },
  cow: { name: 'Clover', what: 'Cow', family: 'farm' },
  unicorn: { name: 'Opal', what: 'Unicorn', family: 'farm' },
  lamb: { name: 'Bobble', what: 'Lamb', family: 'farm' },
  alpaca: { name: 'Quito', what: 'Alpaca', family: 'farm' },
  piglet: { name: 'Truffle', what: 'Piglet', family: 'farm' },
  tigercub: { name: 'Rawr', what: 'Tiger cub', family: 'jungle' },
  elephant: { name: 'Mist', what: 'Baby elephant', family: 'jungle' },
  frog: { name: 'Plink', what: 'Tree frog', family: 'jungle' },
  monkey: { name: 'Bongo', what: 'Monkey', family: 'jungle' },
  chameleon: { name: 'Hue', what: 'Veiled chameleon', family: 'jungle' },
  bee: { name: 'Dandy', what: 'Bee', family: 'bug' },
  butterfly: { name: 'Prism', what: 'Butterfly', family: 'bug' },
  caterpillar: { name: 'Inch', what: 'Caterpillar', family: 'bug' },
  firefly: { name: 'Glim', what: 'Firefly', family: 'bug' },
  beetle: { name: 'Clunk', what: 'Beetle', family: 'bug' },
  hamster: { name: 'Pocket', what: 'Hamster', family: 'fluffy' },
  chinchilla: { name: 'Dusty', what: 'Chinchilla', family: 'fluffy' },
  redpanda: { name: 'Russet', what: 'Red panda', family: 'fluffy' },
  koala: { name: 'Nod', what: 'Koala', family: 'fluffy' },
  panda: { name: 'Bao', what: 'Panda', family: 'fluffy' },
  tin: { name: 'Clatter', what: 'Wind-up tin robot', family: 'robot' },
  tot: { name: 'Dimple', what: 'Toddler robot', family: 'robot' },
  teapot: { name: 'Earl', what: 'Teapot butler', family: 'robot' },
  lanky: { name: 'Lofty', what: 'Play-friend', family: 'robot' },
  skater: { name: 'Skip', what: 'Roller-skating play-friend', family: 'robot' },
  panther: { name: 'Flare', what: 'Panther chameleon', family: 'jungle' },
  jackson: { name: 'Trike', what: "Jackson's chameleon", family: 'jungle' },
  pygmy: { name: 'Twig', what: 'Pygmy leaf chameleon', family: 'jungle' },
  parson: { name: 'Sage', what: "Parson's chameleon", family: 'jungle' },
  jellyfish: { name: 'Lumen', what: 'Jellyfish', family: 'sea' },
  seahorse: { name: 'Bobbin', what: 'Seahorse', family: 'sea' },
  narwhal: { name: 'Nari', what: 'Narwhal', family: 'sea' },
  crab: { name: 'Clack', what: 'Crab', family: 'sea' },
  otter: { name: 'Pebble', what: 'Sea otter', family: 'sea' },
  foal: { name: 'Totter', what: 'Foal', family: 'farm' },
  ram: { name: 'Bram', what: 'Ram', family: 'farm' },
  highlandcalf: { name: 'Barley', what: 'Highland calf', family: 'farm' },
  rooster: { name: 'Tango', what: 'Rooster', family: 'bird' },
  goose: { name: 'Gertie', what: 'Goose', family: 'bird' },
  goat: { name: 'Jink', what: 'Goat kid', family: 'farm' },
  donkey: { name: 'Dobbin', what: 'Donkey', family: 'farm' },
  guineapig: { name: 'Nibbs', what: 'Guinea pig', family: 'farm' },
  ferret: { name: 'Wick', what: 'Ferret', family: 'farm' },
  chick: { name: 'Yolk', what: 'Baby chick', family: 'bird' },
  slinky: { name: 'Tumble', what: 'Slinky', family: 'robot' },
  hexapod: { name: 'Scuttle', what: 'Hexapod', family: 'robot' },
  ballbot: { name: 'Teeter', what: 'Ballbot', family: 'robot' },
  camerabot: { name: 'Shutter', what: 'Camera', family: 'robot' },
  djbot: { name: 'Wax', what: 'DJ', family: 'robot' },
  raccoon: { name: 'Mitts', what: 'Raccoon', family: 'fluffy' },
  beaver: { name: 'Stump', what: 'Beaver', family: 'fluffy' },
  polarcub: { name: 'Floe', what: 'Polar bear cub', family: 'fluffy' },
  mouse: { name: 'Crumb', what: 'Mouse', family: 'fluffy' },
  fawn: { name: 'Dapple', what: 'Fawn', family: 'fluffy' },
  moth: { name: 'Tuft', what: 'Moth', family: 'bug' },
  dragonfly: { name: 'Reed', what: 'Dragonfly', family: 'bug' },
  jumpingspider: { name: 'Muffet', what: 'Jumping spider', family: 'bug' },
  ant: { name: 'Atlas', what: 'Ant', family: 'bug' },
  grasshopper: { name: 'Fiddle', what: 'Grasshopper', family: 'bug' },
  capybara: { name: 'Mellow', what: 'Capybara', family: 'fluffy' },
  wombat: { name: 'Clod', what: 'Wombat', family: 'fluffy' },
  quokka: { name: 'Beam', what: 'Quokka', family: 'fluffy' },
  fennec: { name: 'Dune', what: 'Fennec fox', family: 'fluffy' },
  snowleopard: { name: 'Flurry', what: 'Snow leopard cub', family: 'fluffy' },
  anglerfish: { name: 'Dusk', what: 'Anglerfish', family: 'sea' },
  hermitcrab: { name: 'Tuck', what: 'Hermit crab', family: 'sea' },
  dolphin: { name: 'Echo', what: 'Dolphin', family: 'sea' },
  clownfish: { name: 'Zest', what: 'Clownfish', family: 'sea' },
  mantisshrimp: { name: 'Jab', what: 'Mantis shrimp', family: 'sea' },
  gardener: { name: 'Dibble', what: 'Gardener', family: 'robot' },
  astronaut: { name: 'Orbit', what: 'Astronaut', family: 'robot' },
  painter: { name: 'Dab', what: 'Painter', family: 'robot' },
  juggler: { name: 'Caper', what: 'Four-armed juggler', family: 'robot' },
  knight: { name: 'Clink', what: 'Tin knight', family: 'robot' },
  starfish: { name: 'Mica', what: 'Starfish', family: 'sea' },
  manta: { name: 'Billow', what: 'Manta ray', family: 'sea' },
  axolotl: { name: 'Gilly', what: 'Axolotl', family: 'sea' },
  sealpup: { name: 'Plop', what: 'Seal pup', family: 'sea' },
  babywhale: { name: 'Hum', what: 'Baby whale', family: 'sea' },
  pygmyhippo: { name: 'Plod', what: 'Pygmy hippo', family: 'jungle' },
  tapir: { name: 'Snoot', what: 'Baby tapir', family: 'jungle' },
  gorilla: { name: 'Boulder', what: 'Young gorilla', family: 'jungle' },
  lemur: { name: 'Zesty', what: 'Ring-tailed lemur', family: 'jungle' },
  python: { name: 'Slink', what: 'Python', family: 'jungle' },
};

/** The playgrounds on the Creatures page, one for each family that has one. */
export const PLAYGROUNDS: { family: Family; key: string; label: string; line: string }[] = [
  { family: 'cat', key: 'cats', label: 'Cats', line: 'Yarn, a laser dot, and a crate to hide in.' },
  { family: 'dog', key: 'dogs', label: 'Dogs', line: 'A frisbee, a ball, and room to run.' },
  { family: 'bird', key: 'birds', label: 'Birds', line: 'Bubbles, balloons, and a parade.' },
];

/** The Creatures page's sections, in order, each a family under its heading. */
export const SECTIONS: { family: Family; label: string }[] = [
  { family: 'cat', label: 'Cats' },
  { family: 'dog', label: 'Dogs' },
  { family: 'bird', label: 'Birds' },
  { family: 'fluffy', label: 'Fluffy' },
  { family: 'farm', label: 'Farm' },
  { family: 'jungle', label: 'Jungle' },
  { family: 'sea', label: 'Sea' },
  { family: 'bug', label: 'Bugs' },
  { family: 'robot', label: 'Robots' },
  { family: 'other', label: 'Everyone else' },
];

/** Everyone in a family, in the order they're listed. */
export function inFamily(family: Family) {
  return Object.keys(CARDS).filter((n) => CARDS[n].family === family);
}

/** The command that copies one of the crew's model into a project (see bin/creatures.mjs). */
export function installCommand(name: string) {
  return `npx @wisdomousai/creatures add ${name}`;
}
