"""Everyone in the crew, by name: the module that builds each one. Each module has
build(look='ink', flame=None) -> (rig, parts), FACE (its screen layout in faces.py) and
PREVIEW (how to stand it in the live Blender preview: lift off the floor, width)."""

import importlib

NAMES = (
    'bolt', 'cat', 'dog', 'ladybug', 'duck', 'plant', 'vacuum', 'clock', 'sloth', 'hedgehog', 'owl', 'cactus',
    'octopus', 'bear', 'bunny', 'fox', 'puffer', 'kitten', 'scamp', 'koi', 'squirrel', 'raven', 'shorthair',
    'fatcat', 'swan', 'poodle', 'dachshund', 'puppy', 'macaw', 'bat', 'drone', 'crawler', 'penguin', 'unicycle',
    'pogo', 'nova', 'snail', 'lizard', 'tang', 'turtle', 'tortoise',
    'greatdane', 'corgi', 'husky', 'chihuahua', 'labrador',
    'siamese', 'mainecoon', 'sphynx', 'persian', 'scottishfold',
    'greyhound', 'saintbernard', 'pug', 'bordercollie', 'beagle',
    'bengal', 'ragdoll', 'abyssinian', 'munchkin', 'oldtabby',
    'hummingbird', 'flamingo', 'toucan', 'robin', 'hen',
    'cow', 'unicorn', 'lamb', 'alpaca', 'piglet',
    'tigercub', 'elephant', 'frog', 'monkey', 'chameleon',
    'bee', 'butterfly', 'caterpillar', 'firefly', 'beetle',
    'hamster', 'chinchilla', 'redpanda', 'koala', 'panda',
    'tin', 'tot', 'teapot', 'lanky', 'skater',
    'panther', 'jackson', 'pygmy', 'parson',
    'jellyfish', 'seahorse', 'crab', 'narwhal', 'otter',
    'foal',
    'ram',
    'highlandcalf',
    'rooster',
    'goose',
    'goat', 'guineapig', 'ferret', 'donkey', 'chick',
    'slinky', 'hexapod', 'ballbot', 'camerabot', 'djbot',
    'raccoon', 'beaver', 'polarcub', 'mouse', 'fawn',
    'moth',
    'dragonfly',
    'jumpingspider',
    'ant',
    'grasshopper',
    'capybara', 'wombat', 'quokka', 'fennec', 'snowleopard',
    'anglerfish', 'hermitcrab', 'dolphin', 'clownfish', 'mantisshrimp',
    'gardener', 'astronaut', 'painter', 'juggler', 'knight',
    'starfish', 'manta', 'axolotl', 'sealpup', 'babywhale',
    'pygmyhippo',
    'tapir',
    'gorilla',
    'lemur',
    'python',
)


# Keys whose module has another name (Blender ships a built-in module called manta).
MODULES = {'manta': 'mantaray'}

# The things that hang from the box's ceiling (decor.py), built like the crew.
DECOR = ('mobile', 'pendant', 'disco', 'swing', 'lantern', 'chime', 'orrery', 'planter', 'plane')
# The props the crew play with on the floor (props.py), exported as prop-NAME.
PROPS = ('yarn', 'bone', 'ball', 'cushion', 'crate', 'table', 'balloon', 'frisbee', 'block-star', 'block-ring',
         'block-heart', 'top', 'trampoline', 'seesaw', 'drum', 'wand', 'spot')
# The living set pieces, plants and furniture in the back of the box (set.py), exported as set-NAME.
SET = ('fern', 'sunflower', 'lamp', 'armchair', 'bookshelf', 'rug', 'stool', 'radio', 'fireplace', 'bookcase', 'cattree', 'kennel', 'birdbath', 'perch', 'gramophone', 'libcase', 'librug')
# The old computer in the middle of the box that the site's pages play on (monitor.py).


def module(name):
    if name.startswith('decor-'):
        return importlib.import_module('decor').kind(name[len('decor-'):])
    if name.startswith('prop-'):
        return importlib.import_module('props').kind(name[len('prop-'):])
    if name.startswith('set-'):
        return importlib.import_module('set').kind(name[len('set-'):])
    return importlib.import_module(MODULES.get(name, name))


def reload_all():
    for name in ('kit', 'faces', 'looks', *NAMES):
        importlib.reload(importlib.import_module(MODULES.get(name, name)))
