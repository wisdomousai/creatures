"""The crew's screen faces: glowing shapes on black, drawn the way the site's face.ts
draws them, for the Blender previews. Each character's screen has a layout: its pixel
size and where the eyes and mouth sit, as fractions of the width and height (the same
numbers as the layouts in src/).
"""

import math

import numpy as np

import kit

LAYOUTS = {
    'bolt': dict(size=(512, 320), eyes=((0.34, 0.46), (0.66, 0.46)), rx=0.075, ry=0.2, line=0.03,
                 mouth=(0.5, 0.72)),
    'cat': dict(size=(512, 320), eyes=((0.31, 0.44), (0.69, 0.44)), rx=0.085, ry=0.23, line=0.03,
                mouth=(0.5, 0.74), kind='cat'),
    'dog': dict(size=(512, 256), eyes=((0.3, 0.52), (0.7, 0.52)), rx=0.08, ry=0.27, line=0.035, mouth=None),
    'ladybug': dict(size=(256, 192), eyes=((0.31, 0.48), (0.69, 0.48)), rx=0.12, ry=0.25, line=0.05,
                    mouth=(0.5, 0.8)),
    'duck': dict(size=(512, 224), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.07, ry=0.3, line=0.035, mouth=None),
    'plant': dict(size=(512, 320), eyes=((0.34, 0.44), (0.66, 0.44)), rx=0.08, ry=0.21, line=0.032,
                  mouth=(0.5, 0.72)),
    'vacuum': dict(size=(512, 160), eyes=((0.37, 0.5), (0.63, 0.5)), rx=0.05, ry=0.3, line=0.03, mouth=None),
    'sloth': dict(size=(512, 160), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.065, ry=0.3, line=0.034, mouth=None),
    'clock': dict(size=(512, 512), eyes=((0.37, 0.42), (0.63, 0.42)), rx=0.055, ry=0.1, line=0.028,
                  mouth=(0.5, 0.66), kind='dial'),
    'hedgehog': dict(size=(512, 256), eyes=((0.31, 0.5), (0.69, 0.5)), rx=0.085, ry=0.27, line=0.035, mouth=None),
    # Round eyes, as big as the screen allows, inside the lens rings.
    'owl': dict(size=(512, 256), eyes=((0.27, 0.5), (0.73, 0.5)), rx=0.15, ry=0.3, line=0.042, mouth=None),
    'cactus': dict(size=(512, 320), eyes=((0.32, 0.43), (0.68, 0.43)), rx=0.085, ry=0.22, line=0.034,
                   mouth=(0.5, 0.74)),
    'octopus': dict(size=(512, 256), eyes=((0.32, 0.44), (0.68, 0.44)), rx=0.09, ry=0.25, line=0.035,
                    mouth=(0.5, 0.8)),
    'bear': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.09, ry=0.19, line=0.035, mouth=None),
    'bunny': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.09, ry=0.3, line=0.035, mouth=None),
    'fox': dict(size=(512, 256), eyes=((0.31, 0.5), (0.69, 0.5)), rx=0.08, ry=0.28, line=0.035, mouth=None),
    'puffer': dict(size=(512, 320), eyes=((0.29, 0.48), (0.71, 0.48)), rx=0.14, ry=0.33, line=0.035, mouth=None),
    # Big round cat eyes, low on the screen, and a small ω mouth.
    'kitten': dict(size=(512, 320), eyes=((0.29, 0.5), (0.71, 0.5)), rx=0.105, ry=0.29, line=0.03,
                   mouth=(0.5, 0.8), kind='cat', pupil=0.6),
    'scamp': dict(size=(512, 320), eyes=((0.3, 0.46), (0.7, 0.46)), rx=0.095, ry=0.28, line=0.03,
                  mouth=(0.5, 0.78), kind='cat', pupil=0.6),
    'koi': dict(size=(512, 108), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.08, ry=0.38, line=0.035, mouth=None),
    'squirrel': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.1, ry=0.3, line=0.036, mouth=None),
    'raven': dict(size=(512, 224), eyes=((0.31, 0.5), (0.69, 0.5)), rx=0.08, ry=0.28, line=0.035, mouth=None),
    # Huge round eyes, nearly filling the screen (the British shorthair's signature).
    'shorthair': dict(size=(512, 320), eyes=((0.275, 0.46), (0.725, 0.46)), rx=0.17, ry=0.27, line=0.036,
                      mouth=(0.5, 0.87), kind='cat', pupil=0.6, dilate=0.8),
    'fatcat': dict(size=(512, 320), eyes=((0.31, 0.44), (0.69, 0.44)), rx=0.09, ry=0.22, line=0.032,
                   mouth=(0.5, 0.76), kind='cat'),
    # A swan's small wide-set eyes on a 8:5 visor.
    'swan': dict(size=(512, 320), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.08, ry=0.22, line=0.035, mouth=None),
    'poodle': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.075, ry=0.26, line=0.035, mouth=None),
    'dachshund': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.08, ry=0.27, line=0.035, mouth=None),
    'puppy': dict(size=(512, 256), eyes=((0.29, 0.5), (0.71, 0.5)), rx=0.1, ry=0.34, line=0.035, mouth=None),
    'greatdane': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.075, ry=0.26, line=0.035, mouth=None),
    'corgi': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.09, ry=0.3, line=0.035, mouth=None),
    'husky': dict(size=(512, 256), eyes=((0.29, 0.5), (0.71, 0.5)), rx=0.08, ry=0.25, line=0.035, mouth=None),
    'chihuahua': dict(size=(512, 256), eyes=((0.28, 0.5), (0.72, 0.5)), rx=0.115, ry=0.4, line=0.035, mouth=None),
    'labrador': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.085, ry=0.26, line=0.035, mouth=None),
    'macaw': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.095, ry=0.3, line=0.038, mouth=None),
    # Huge round eyes on a wide screen; the fangs are on the model, so no mouth.
    'bat': dict(size=(512, 320), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.135, ry=0.3, line=0.04, mouth=None),
    # A drone's wide visor, and a crawler's binocular periscope eye.
    'drone': dict(size=(512, 256), eyes=((0.3, 0.43), (0.7, 0.43)), rx=0.09, ry=0.25, line=0.035,
                  mouth=(0.5, 0.82)),
    'crawler': dict(size=(512, 256), eyes=((0.29, 0.5), (0.71, 0.5)), rx=0.1, ry=0.29, line=0.038, mouth=None),
    # Big round earnest eyes on a wide screen.
    'penguin': dict(size=(512, 288), eyes=((0.28, 0.5), (0.72, 0.5)), rx=0.11, ry=0.3, line=0.04, mouth=None),
    # A show-off's wide eyes and a big grin on an 8:5 screen.
    'unicycle': dict(size=(512, 320), eyes=((0.3, 0.42), (0.7, 0.42)), rx=0.09, ry=0.24, line=0.032,
                     mouth=(0.5, 0.76)),
    # Big round excited eyes and a wide smile on a 4:3 screen.
    'pogo': dict(size=(512, 384), eyes=((0.3, 0.42), (0.7, 0.42)), rx=0.1, ry=0.26, line=0.034,
                 mouth=(0.5, 0.78)),
    # A wide visor with big eyes and lashes flicking up and out from their outer corners.
    'nova': dict(size=(512, 320), eyes=((0.3, 0.47), (0.7, 0.47)), rx=0.08, ry=0.22, line=0.03,
                 mouth=(0.5, 0.75), kind='girl'),
    'snail': dict(size=(512, 320), eyes=((0.31, 0.46), (0.69, 0.46)), rx=0.095, ry=0.27, line=0.032,
                  mouth=(0.5, 0.78)),
    # Wide gecko eyes across a wide screen, a small smile under them.
    'lizard': dict(size=(512, 256), eyes=((0.28, 0.46), (0.72, 0.46)), rx=0.115, ry=0.34, line=0.036,
                   mouth=(0.5, 0.82)),
    # Big round dreamy eyes and a small mouth, on a tall visor.
    'tang': dict(size=(512, 320), eyes=((0.25, 0.42), (0.75, 0.42)), rx=0.11, ry=0.185, line=0.04, mouth=(0.5, 0.82)),
    # A sea turtle's big friendly eyes and small smile, and a tortoise's sleepy, wise ones.
    'turtle': dict(size=(512, 320), eyes=((0.29, 0.46), (0.71, 0.46)), rx=0.11, ry=0.3, line=0.036,
                   mouth=(0.5, 0.82)),
    'tortoise': dict(size=(512, 256), eyes=((0.3, 0.44), (0.7, 0.44)), rx=0.075, ry=0.22, line=0.036,
                     mouth=(0.5, 0.84)),
    # A Siamese's slim slanted-looking eyes, blue, and a small mouth.
    'siamese': dict(size=(512, 320), eyes=((0.3, 0.46), (0.7, 0.46)), rx=0.078, ry=0.23, line=0.03,
                    mouth=(0.5, 0.8), kind='cat', pupil=0.5),
    # A gentle giant's wide, calm cat eyes.
    'mainecoon': dict(size=(512, 320), eyes=((0.3, 0.46), (0.7, 0.46)), rx=0.09, ry=0.25, line=0.034,
                      mouth=(0.5, 0.82), kind='cat', pupil=0.55),
    # Big round lemon eyes, wide apart under a wrinkled brow.
    'sphynx': dict(size=(512, 320), eyes=((0.29, 0.46), (0.71, 0.46)), rx=0.1, ry=0.27, line=0.032,
                   mouth=(0.5, 0.82), kind='cat', pupil=0.55),
    # An old Persian's big round eyes, low on a flat face, and a tiny nose and mouth.
    'persian': dict(size=(512, 320), eyes=((0.29, 0.44), (0.71, 0.44)), rx=0.1, ry=0.25, line=0.034,
                    mouth=(0.5, 0.84), kind='cat', pupil=0.6),
    # A Scottish Fold kitten's owl-round eyes, as wide as they are tall, and a small mouth.
    'scottishfold': dict(size=(512, 320), eyes=((0.29, 0.47), (0.71, 0.47)), rx=0.15, ry=0.24, line=0.034,
                         mouth=(0.5, 0.86), kind='cat', pupil=0.6),
    # A greyhound's narrow, intent eyes on a long thin head.
    'greyhound': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.065, ry=0.3, line=0.035, mouth=None),
    # A Saint Bernard's big sad eyes under heavy brows.
    'saintbernard': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.085, ry=0.3, line=0.04, mouth=None),
    # A pug's big round bulging eyes.
    'pug': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.1, ry=0.34, line=0.04, mouth=None),
    # A border collie's intent, alert eyes.
    'bordercollie': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.07, ry=0.3, line=0.036, mouth=None),
    # A beagle puppy's big round eyes.
    'beagle': dict(size=(512, 256), eyes=((0.29, 0.5), (0.71, 0.5)), rx=0.1, ry=0.33, line=0.036, mouth=None),
    # A Bengal's wide, bright, alert eyes.
    'bengal': dict(size=(512, 320), eyes=((0.3, 0.47), (0.7, 0.47)), rx=0.1, ry=0.27, line=0.032,
                   mouth=(0.5, 0.8), kind='cat', pupil=0.6, dilate=0.3),
    # A Ragdoll's big round blue eyes, set wide, and a soft mouth.
    'ragdoll': dict(size=(512, 320), eyes=((0.29, 0.47), (0.71, 0.47)), rx=0.115, ry=0.3, line=0.034,
                    mouth=(0.5, 0.84), kind='cat', pupil=0.55, dilate=0.5),
    # An Abyssinian's large almond eyes, wide and shallow, set wide.
    'abyssinian': dict(size=(512, 320), eyes=((0.285, 0.46), (0.715, 0.46)), rx=0.125, ry=0.2, line=0.03,
                       mouth=(0.5, 0.82), kind='cat', pupil=0.7, dilate=0.2),
    # A Munchkin kitten's huge round eyes, low and wide.
    'munchkin': dict(size=(512, 320), eyes=((0.29, 0.5), (0.71, 0.5)), rx=0.108, ry=0.3, line=0.03,
                     mouth=(0.5, 0.82), kind='cat', pupil=0.6, dilate=0.5),
    # An old cat's tired, heavy-lidded eyes, set low and wide, a small mouth.
    'oldtabby': dict(size=(512, 320), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.095, ry=0.23, line=0.032,
                     mouth=(0.5, 0.82), kind='cat', pupil=0.6, dilate=0.0),
    # The new birds: a hummingbird's small bright eyes, a flamingo's narrow haughty ones, a toucan's
    # in its blue patch, a robin's big round ones, and a hen's wide-set ones.
    'hummingbird': dict(size=(512, 384), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.09, ry=0.2, line=0.04, mouth=None),
    'flamingo': dict(size=(512, 288), eyes=((0.31, 0.5), (0.69, 0.5)), rx=0.075, ry=0.2, line=0.036, mouth=None),
    'toucan': dict(size=(512, 320), eyes=((0.29, 0.5), (0.71, 0.5)), rx=0.1, ry=0.22, line=0.04, mouth=None),
    'robin': dict(size=(512, 384), eyes=((0.29, 0.5), (0.71, 0.5)), rx=0.1, ry=0.2, line=0.04, mouth=None),
    'hen': dict(size=(512, 320), eyes=((0.27, 0.5), (0.73, 0.5)), rx=0.085, ry=0.21, line=0.038, mouth=None),
    # The hoofed animals: a cow's wide gentle eyes, a unicorn's big bright ones, a lamb's round ones,
    # an alpaca's tall slow ones, a piglet's small happy ones.
    'cow': dict(size=(512, 300), eyes=((0.27, 0.5), (0.73, 0.5)), rx=0.07, ry=0.25, line=0.035, mouth=None),
    'unicorn': dict(size=(512, 320), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.085, ry=0.27, line=0.035, mouth=None),
    'lamb': dict(size=(512, 320), eyes=((0.29, 0.5), (0.71, 0.5)), rx=0.09, ry=0.25, line=0.04, mouth=None),
    'alpaca': dict(size=(512, 320), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.065, ry=0.27, line=0.035, mouth=None),
    'piglet': dict(size=(512, 320), eyes=((0.28, 0.5), (0.72, 0.5)), rx=0.075, ry=0.22, line=0.04, mouth=None),
    # A tiger cub's huge round cat eyes, wide set.
    'tigercub': dict(size=(512, 320), eyes=((0.28, 0.5), (0.72, 0.5)), rx=0.115, ry=0.31, line=0.03,
                     mouth=(0.5, 0.82), kind='cat', pupil=0.6, dilate=0.5),
    # A baby elephant's small eyes either side of its trunk.
    'elephant': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.09, ry=0.28, line=0.035, mouth=None),
    # A tree frog's wide-set round eyes and a wide smile.
    'frog': dict(size=(512, 256), eyes=((0.3, 0.44), (0.7, 0.44)), rx=0.1, ry=0.27, line=0.036, mouth=(0.5, 0.8)),
    # A monkey's wide face plate: round eyes and a grin.
    'monkey': dict(size=(512, 256), eyes=((0.3, 0.46), (0.7, 0.46)), rx=0.1, ry=0.27, line=0.036, mouth=(0.5, 0.8)),
    # A chameleon's small wide-set eyes and a thin smile.
    'chameleon': dict(size=(512, 256), eyes=((0.3, 0.46), (0.7, 0.46)), rx=0.1, ry=0.27, line=0.036, mouth=(0.5, 0.82)),
    # The bugs: a bee's big round eyes and small smile.
    'bee': dict(size=(256, 192), eyes=((0.3, 0.47), (0.7, 0.47)), rx=0.11, ry=0.27, line=0.05, mouth=(0.5, 0.8)),
    'butterfly': dict(size=(256, 192), eyes=((0.29, 0.48), (0.71, 0.48)), rx=0.115, ry=0.27, line=0.05,
                      mouth=(0.5, 0.82)),
    'caterpillar': dict(size=(512, 320), eyes=((0.3, 0.46), (0.7, 0.46)), rx=0.095, ry=0.28, line=0.034,
                        mouth=(0.5, 0.8)),
    'firefly': dict(size=(256, 192), eyes=((0.3, 0.47), (0.7, 0.47)), rx=0.1, ry=0.26, line=0.05,
                    mouth=(0.5, 0.8)),
    'beetle': dict(size=(256, 192), eyes=((0.3, 0.47), (0.7, 0.47)), rx=0.105, ry=0.27, line=0.05,
                   mouth=(0.5, 0.8)),
    # The small fluffy ones: a hamster's round eyes, a chinchilla's huge dark ones, a red panda's, a
    # koala's small sleepy ones and a panda's.
    'hamster': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.09, ry=0.32, line=0.035, mouth=None),
    'chinchilla': dict(size=(512, 256), eyes=((0.29, 0.5), (0.71, 0.5)), rx=0.105, ry=0.38, line=0.035, mouth=None,
                       pupil=0.62),
    'redpanda': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.08, ry=0.27, line=0.035, mouth=None),
    'koala': dict(size=(512, 256), eyes=((0.27, 0.5), (0.73, 0.5)), rx=0.07, ry=0.2, line=0.035, mouth=None),
    'panda': dict(size=(512, 256), eyes=((0.29, 0.5), (0.71, 0.5)), rx=0.1, ry=0.3, line=0.036, mouth=None),
    # The toy robots: a tin wind-up's round eyes and grin, a toddler's huge shiny eyes, a butler's
    # calm ones, a beanpole's wide-open ones, and a skater's visor slits.
    'tin': dict(size=(512, 368), eyes=((0.3, 0.43), (0.7, 0.43)), rx=0.095, ry=0.25, line=0.034, mouth=(0.5, 0.77)),
    'tot': dict(size=(512, 384), eyes=((0.29, 0.45), (0.71, 0.45)), rx=0.125, ry=0.3, line=0.04, mouth=(0.5, 0.82)),
    'teapot': dict(size=(512, 320), eyes=((0.3, 0.45), (0.7, 0.45)), rx=0.085, ry=0.22, line=0.032,
                   mouth=(0.5, 0.74)),
    'lanky': dict(size=(512, 384), eyes=((0.3, 0.45), (0.7, 0.45)), rx=0.095, ry=0.26, line=0.036,
                  mouth=(0.5, 0.77)),
    'skater': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.085, ry=0.3, line=0.04, mouth=None),
    'panther': dict(size=(512, 256), eyes=((0.3, 0.46), (0.7, 0.46)), rx=0.105, ry=0.28, line=0.036, mouth=(0.5, 0.82)),
    'jackson': dict(size=(512, 256), eyes=((0.3, 0.46), (0.7, 0.46)), rx=0.1, ry=0.27, line=0.036, mouth=(0.5, 0.82)),
    'pygmy': dict(size=(512, 256), eyes=((0.3, 0.46), (0.7, 0.46)), rx=0.115, ry=0.3, line=0.04, mouth=(0.5, 0.82)),
    'parson': dict(size=(512, 256), eyes=((0.3, 0.46), (0.7, 0.46)), rx=0.095, ry=0.25, line=0.034, mouth=(0.5, 0.82)),
    # The sea: a jellyfish's round eyes and little smile on its bell, a seahorse's, the crab's on a visor held
    # up on stalks (eyes far apart), a narwhal's, an otter's.
    'jellyfish': dict(size=(512, 288), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.1, ry=0.3, line=0.036, mouth=(0.5, 0.82)),
    'seahorse': dict(size=(512, 320), eyes=((0.3, 0.46), (0.7, 0.46)), rx=0.1, ry=0.27, line=0.036, mouth=None),
    'crab': dict(size=(512, 192), eyes=((0.18, 0.5), (0.82, 0.5)), rx=0.1, ry=0.38, line=0.04, mouth=(0.5, 0.74)),
    'narwhal': dict(size=(512, 320), eyes=((0.28, 0.5), (0.72, 0.5)), rx=0.12, ry=0.3, line=0.038, mouth=(0.5, 0.8)),
    'otter': dict(size=(512, 320), eyes=((0.3, 0.46), (0.7, 0.46)), rx=0.09, ry=0.25, line=0.034, mouth=None),
    # The farm: a foal's huge eyes, and more.
    'foal': dict(size=(512, 340), eyes=((0.29, 0.5), (0.71, 0.5)), rx=0.105, ry=0.36, line=0.035, mouth=None,
                 pupil=0.62),
    'ram': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.075, ry=0.22, line=0.04, mouth=None),
    'highlandcalf': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.08, ry=0.3, line=0.035, mouth=None),
    'rooster': dict(size=(512, 320), eyes=((0.28, 0.5), (0.72, 0.5)), rx=0.075, ry=0.2, line=0.036, mouth=None),
    'goose': dict(size=(512, 288), eyes=((0.27, 0.5), (0.73, 0.5)), rx=0.08, ry=0.24, line=0.036, mouth=None),
    # More farm: a goat kid's bright eyes, a guinea pig's, a ferret's small bright ones in a mask, a
    # donkey's gentle ones and a chick's big round ones.
    'goat': dict(size=(512, 320), eyes=((0.28, 0.5), (0.72, 0.5)), rx=0.09, ry=0.24, line=0.04, mouth=None),
    'guineapig': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.085, ry=0.34, line=0.035, mouth=None),
    'ferret': dict(size=(512, 256), eyes=((0.29, 0.5), (0.71, 0.5)), rx=0.07, ry=0.28, line=0.035, mouth=None),
    'donkey': dict(size=(512, 320), eyes=((0.27, 0.5), (0.73, 0.5)), rx=0.08, ry=0.22, line=0.04, mouth=None),
    'chick': dict(size=(512, 320), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.11, ry=0.3, line=0.04, mouth=None),
    'slinky': dict(size=(512, 320), eyes=((0.3, 0.45), (0.7, 0.45)), rx=0.09, ry=0.26, line=0.034,
                   mouth=(0.5, 0.77)),
    # One big round eye on a square screen, and a small smile under it.
    'hexapod': dict(size=(384, 384), eyes=((0.5, 0.45),), rx=0.27, ry=0.27, line=0.045, mouth=(0.5, 0.82)),
    'ballbot': dict(size=(448, 320), eyes=((0.3, 0.46), (0.7, 0.46)), rx=0.08, ry=0.24, line=0.034, mouth=(0.5, 0.77)),
    # The lens glass: a round screen with two eyes and a smile.
    'camerabot': dict(size=(384, 384), eyes=((0.3, 0.44), (0.7, 0.44)), rx=0.085, ry=0.17, line=0.04, mouth=(0.5, 0.76)),
    # A wide visor screen: two eyes and a grin.
    'djbot': dict(size=(512, 288), eyes=((0.3, 0.46), (0.7, 0.46)), rx=0.08, ry=0.25, line=0.034, mouth=(0.5, 0.78)),
    # The woodland and polar: a raccoon's small bright eyes in its mask.
    'raccoon': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.075, ry=0.26, line=0.035, mouth=None),
    'beaver': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.08, ry=0.28, line=0.035, mouth=None),
    'polarcub': dict(size=(512, 256), eyes=((0.29, 0.5), (0.71, 0.5)), rx=0.07, ry=0.24, line=0.036, mouth=None),
    'mouse': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.085, ry=0.3, line=0.035, mouth=None),
    'fawn': dict(size=(512, 340), eyes=((0.29, 0.5), (0.71, 0.5)), rx=0.1, ry=0.34, line=0.035, mouth=None, pupil=0.62),
    # Bugs II: the moth's big soft eyes.
    'moth': dict(size=(256, 192), eyes=((0.3, 0.48), (0.7, 0.48)), rx=0.105, ry=0.28, line=0.05,
                 mouth=(0.5, 0.82)),
    # The dragonfly's two big round eyes.
    'dragonfly': dict(size=(256, 192), eyes=((0.29, 0.5), (0.71, 0.5)), rx=0.15, ry=0.3, line=0.05, mouth=None),
    # The jumping spider's huge round front eyes.
    'jumpingspider': dict(size=(256, 192), eyes=((0.29, 0.5), (0.71, 0.5)), rx=0.18, ry=0.32, line=0.05, mouth=None),
    'ant': dict(size=(256, 192), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.11, ry=0.28, line=0.05, mouth=(0.5, 0.82)),
    # The grasshopper's tall face: long oval eyes on a 4:5 screen.
    'grasshopper': dict(size=(192, 240), eyes=((0.3, 0.46), (0.7, 0.46)), rx=0.12, ry=0.2, line=0.05, mouth=(0.5, 0.82)),
    # The fluffy wave (III): the capybara's eyes sit high on a wide blunt screen; the wombat's
    # are small and wide apart on a broad flat one; the quokka's always smiles; the fennec's
    # are big and dark under giant ears; the snow leopard is a cat.
    'capybara': dict(size=(448, 200), eyes=((0.27, 0.36), (0.73, 0.36)), rx=0.055, ry=0.21, line=0.03, mouth=None),
    'wombat': dict(size=(512, 208), eyes=((0.22, 0.5), (0.78, 0.5)), rx=0.05, ry=0.26, line=0.03, mouth=None),
    'quokka': dict(size=(448, 256), eyes=((0.3, 0.38), (0.7, 0.38)), rx=0.075, ry=0.26, line=0.034, mouth=(0.5, 0.66)),
    'fennec': dict(size=(448, 288), eyes=((0.29, 0.46), (0.71, 0.46)), rx=0.09, ry=0.3, line=0.034, mouth=None),
    'snowleopard': dict(size=(512, 320), eyes=((0.28, 0.5), (0.72, 0.5)), rx=0.11, ry=0.3, line=0.03, mouth=(0.5, 0.82),
                        kind='cat', pupil=0.6),
    # Sea III: the anglerfish's, the hermit crab's, the dolphin's, the clownfish's, and one stalked eye of the
    # mantis shrimp's (two screens, one on each stalk, each showing a single eye).
    'anglerfish': dict(size=(512, 320), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.11, ry=0.3, line=0.038, mouth=(0.5, 0.8)),
    'hermitcrab': dict(size=(512, 320), eyes=((0.3, 0.48), (0.7, 0.48)), rx=0.1, ry=0.28, line=0.038, mouth=(0.5, 0.8)),
    'dolphin': dict(size=(512, 288), eyes=((0.3, 0.45), (0.7, 0.45)), rx=0.09, ry=0.27, line=0.036, mouth=(0.5, 0.8)),
    'clownfish': dict(size=(512, 352), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.115, ry=0.3, line=0.038, mouth=(0.5, 0.82)),
    'mantisshrimp': dict(size=(256, 256), eyes=((0.5, 0.5), (0.5, 0.5)), rx=0.24, ry=0.24, line=0.07, mouth=None),
    # The job robots: a watering can's round screen, a smile under the eyes.
    'gardener': dict(size=(512, 334), eyes=((0.3, 0.45), (0.7, 0.45)), rx=0.085, ry=0.22, line=0.034,
                     mouth=(0.5, 0.76)),
    # The astronaut's round visor.
    'astronaut': dict(size=(512, 384), eyes=((0.3, 0.46), (0.7, 0.46)), rx=0.09, ry=0.2, line=0.034,
                      mouth=(0.5, 0.76)),
    'painter': dict(size=(512, 348), eyes=((0.3, 0.46), (0.7, 0.46)), rx=0.085, ry=0.21, line=0.034,
                    mouth=(0.5, 0.76)),
    'juggler': dict(size=(512, 362), eyes=((0.3, 0.46), (0.7, 0.46)), rx=0.085, ry=0.22, line=0.034,
                    mouth=(0.5, 0.77)),
    'knight': dict(size=(512, 350), eyes=((0.3, 0.46), (0.7, 0.46)), rx=0.085, ry=0.2, line=0.034,
                   mouth=(0.5, 0.78)),
    # The sea, second wave: a starfish's round eyes and smile in its hub, a manta's wide-set small ones, an
    # axolotl's wide smile, a seal pup's big dark eyes, a baby whale's.
    'starfish': dict(size=(512, 420), eyes=((0.3, 0.42), (0.7, 0.42)), rx=0.1, ry=0.13, line=0.034, mouth=(0.5, 0.72)),
    'manta': dict(size=(512, 256), eyes=((0.22, 0.5), (0.78, 0.5)), rx=0.07, ry=0.26, line=0.036, mouth=None),
    'axolotl': dict(size=(512, 288), eyes=((0.26, 0.4), (0.74, 0.4)), rx=0.07, ry=0.24, line=0.036, mouth=(0.5, 0.74)),
    'sealpup': dict(size=(512, 288), eyes=((0.3, 0.46), (0.7, 0.46)), rx=0.12, ry=0.36, line=0.036, mouth=None, pupil=0.62),
    'babywhale': dict(size=(512, 320), eyes=((0.27, 0.5), (0.73, 0.5)), rx=0.1, ry=0.3, line=0.036, mouth=(0.5, 0.8)),
    'pygmyhippo': dict(size=(512, 320), eyes=((0.25, 0.5), (0.75, 0.5)), rx=0.085, ry=0.26, line=0.04, mouth=None),
    'tapir': dict(size=(512, 320), eyes=((0.29, 0.5), (0.71, 0.5)), rx=0.09, ry=0.28, line=0.04, mouth=None),
    'gorilla': dict(size=(512, 256), eyes=((0.31, 0.5), (0.69, 0.5)), rx=0.085, ry=0.22, line=0.045, mouth=(0.5, 0.82)),
    'lemur': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.13, ry=0.36, line=0.04, mouth=None),
    'python': dict(size=(512, 256), eyes=((0.3, 0.5), (0.7, 0.5)), rx=0.1, ry=0.3, line=0.04, mouth=None),
}

FACES = ('neutral', 'blink', 'happy', 'surprised', 'love', 'wink', 'sleepy', 'asleep', 'dizzy', 'cross')


def face_pixels(expression, glow_hex, layout='bolt', clock=(10, 10)):
    """One expression on a screen. Drawn at twice the size and averaged down for smooth
    edges. Returns an (h, w, 4) float array, row 0 at the top."""
    L = LAYOUTS[layout]
    w, h = L['size']
    W, H = w * 2, h * 2
    img = np.zeros((H, W, 4), dtype=np.float32)
    img[..., 3] = 1
    glow = np.array(kit.srgb(glow_hex)[:3], dtype=np.float32)

    def paint(x0, y0, x1, y1, inside, colour=None):
        """Fill where inside(xx, yy) holds, testing only pixels in the box."""
        x0, y0, x1, y1 = max(int(x0), 0), max(int(y0), 0), min(int(x1) + 2, W), min(int(y1) + 2, H)
        if x0 < x1 and y0 < y1:
            yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
            img[y0:y1, x0:x1, :3][inside(xx, yy)] = glow if colour is None else colour

    def ellipse(c, rx, ry, top=None):
        cx, cy = c

        def inside(xx, yy):
            m = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1
            return m if top is None else m & (yy >= top)

        paint(cx - rx, cy - ry, cx + rx, cy + ry, inside)

    def stroke(points, width):
        pts, r = np.asarray(points, dtype=np.float32), width / 2

        def inside(xx, yy):
            d = np.full(xx.shape, np.inf, dtype=np.float32)
            for (ax, ay), (bx, by) in zip(pts, pts[1:]):
                dx, dy = bx - ax, by - ay
                t = np.clip(((xx - ax) * dx + (yy - ay) * dy) / (dx * dx + dy * dy + 1e-9), 0, 1)
                d = np.minimum(d, np.hypot(xx - ax - t * dx, yy - ay - t * dy))
            return d <= r

        paint(pts[:, 0].min() - r, pts[:, 1].min() - r, pts[:, 0].max() + r, pts[:, 1].max() + r, inside)

    def arc(c, rx, ry, a0, a1, width):
        t = np.linspace(a0, a1, 32)
        stroke(np.stack([c[0] + rx * np.cos(t), c[1] + ry * np.sin(t)], 1), width)

    def heart(c, size):
        def inside(xx, yy):
            x, y = (xx - c[0]) / size, (c[1] - yy) / size + 0.15
            return (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0

        paint(c[0] - 1.3 * size, c[1] - 1.3 * size, c[0] + 1.3 * size, c[1] + 1.3 * size, inside)

    def pupil(c, erx, ery, clip=None, size=1.0, drop=0.0, wide=None):
        """A dark pupil with a glint, inside the eye (and inside clip, a lid or a brow),
        dropped by `drop` of the eye's height; a cat's is an upright ellipse, a slit
        until `wide` opens it."""
        wide = L.get('dilate', 0.0) if wide is None else wide  # a layout may set round pupils
        r = min(erx, ery) * L.get('pupil', 0.5) * size
        prx, pry = (erx * (0.2 + 0.5 * wide) * size, ery * (0.8 - 0.1 * wide)) if kind == 'cat' else (r, r)
        px, py = c[0], c[1] + drop * ery

        def within(xx, yy):
            m = ((xx - c[0]) / erx) ** 2 + ((yy - c[1]) / ery) ** 2 <= 1
            return m if clip is None else m & clip(xx, yy)

        def disc(x, y, rx_, ry_, colour=None):
            paint(x - rx_, y - ry_, x + rx_, y + ry_,
                  lambda xx, yy: (((xx - x) / rx_) ** 2 + ((yy - y) / ry_) ** 2 <= 1) & within(xx, yy), colour)

        disc(px, py, prx, pry, np.zeros(3, dtype=np.float32))
        disc(px - r * 0.3, py - r * 0.45, r * 0.24, r * 0.24)

    # Image y grows downwards, so angles 0..pi trace the lower half of an arc.
    pi = math.pi
    eyes = [(x * W, y * H) for x, y in L['eyes']]  # the character's right eye first
    rx, ry, line = L['rx'] * W, L['ry'] * H, L['line'] * W
    mouth = (L['mouth'][0] * W, L['mouth'][1] * H) if L['mouth'] else None
    kind = L.get('kind')

    if kind == 'dial':  # a clock: hour ticks round the rim, hands at `clock` (h, m)
        c = (0.5 * W, 0.5 * H)
        for i in range(12):
            a = i / 12 * 2 * pi
            r0, r1 = (0.36 if i % 3 else 0.33) * W, 0.41 * W
            stroke([(c[0] + r0 * math.sin(a), c[1] - r0 * math.cos(a)),
                    (c[0] + r1 * math.sin(a), c[1] - r1 * math.cos(a))], line * (0.8 if i % 3 else 1.1))
        hours, minutes = clock
        for a, r, wdt in ((((hours % 12) + minutes / 60) / 12 * 2 * pi, 0.2 * W, line * 1.2),
                          (minutes / 60 * 2 * pi, 0.3 * W, line * 0.8)):
            stroke([c, (c[0] + r * math.sin(a), c[1] - r * math.cos(a))], wdt)

    def smile(big=False):
        if not mouth:
            return
        if kind == 'cat':  # a small ω under a nose
            ellipse((mouth[0], mouth[1] - 0.06 * H), 0.025 * W, 0.03 * H)
            for s in (-1, 1):
                arc((mouth[0] + s * 0.03 * W, mouth[1]), 0.03 * W, 0.05 * H, 0.1 * pi, 0.9 * pi, line * 0.8)
        elif big:
            arc((mouth[0], mouth[1] - 0.02 * H), 0.075 * W, 0.1 * H, 0.12 * pi, 0.88 * pi, line * 1.1)
        else:
            arc(mouth, 0.055 * W, 0.07 * H, 0.15 * pi, 0.85 * pi, line * 0.85)

    def frown():
        if not mouth:
            return
        if kind == 'cat':
            ellipse((mouth[0], mouth[1] - 0.06 * H), 0.025 * W, 0.03 * H)
        arc((mouth[0], mouth[1] + 0.09 * H), 0.05 * W, 0.06 * H, 1.15 * pi, 1.85 * pi, line * 0.85)

    def lashes(c, erx, ery, side, shown=None):
        """A girl's lashes: three flicks up and out from the eye's outer corner (side -1 is
        the viewer's left). `shown` is the eye's open height (a blink shortens them)."""
        if kind != 'girl':
            return
        shown = ery if shown is None else shown
        for t in (0.35, 0.72, 1.08):
            p0 = (c[0] + side * erx * math.cos(t) * 1.02, c[1] - shown * math.sin(t) * 1.02)
            d = np.array([side * math.cos(t) * 1.0, -math.sin(t) * 1.25])
            d = d / np.hypot(*d) * ery * 0.42
            stroke([p0, (p0[0] + d[0], p0[1] + d[1])], line * 0.75)

    def happy_eye(c):  # ^
        arc((c[0], c[1] + ry * 0.3), rx * 0.95, ry * 0.55, 1.1 * pi, 1.9 * pi, line)

    def closed_eye(c):  # a lash line, curving down
        arc((c[0], c[1] - ry * 0.15), rx * 0.95, ry * 0.35, 0.1 * pi, 0.9 * pi, line)

    if expression == 'neutral':
        for i, c in enumerate(eyes):
            ellipse(c, rx, ry)
            pupil(c, rx, ry)
            lashes(c, rx, ry, -1 if i == 0 else 1)
        smile()
    elif expression == 'blink':
        for c in eyes:
            closed_eye(c)
        smile()
    elif expression == 'happy':
        for c in eyes:
            happy_eye(c)
        smile(big=True)
    elif expression == 'surprised':
        for i, c in enumerate(eyes):
            ellipse(c, rx * 1.13, ry * 0.63)
            pupil(c, rx * 1.13, ry * 0.63, size=1.0 if kind == 'cat' else 0.6, wide=1.0)
            lashes(c, rx * 1.13, ry * 0.63, -1 if i == 0 else 1)
        if mouth:
            arc((mouth[0], mouth[1] + 0.04 * H), 0.028 * W, 0.042 * H, 0, 2 * pi, line * 0.8)
    elif expression == 'love':
        for c in eyes:
            heart(c, rx * 0.83)
        smile(big=True)
    elif expression == 'wink':
        ellipse(eyes[0], rx, ry)
        pupil(eyes[0], rx, ry)
        lashes(eyes[0], rx, ry, -1)
        happy_eye(eyes[1])
        smile(big=True)
    elif expression == 'sleepy':
        for c in eyes:
            ellipse(c, rx, ry * 0.75, top=c[1] + ry * 0.1)
            pupil(c, rx, ry * 0.75, clip=lambda xx, yy, c=c: yy >= c[1] + ry * 0.1, drop=0.45)
        if mouth:
            stroke([(mouth[0] - 0.03 * W, mouth[1] + 0.03 * H), (mouth[0] + 0.03 * W, mouth[1] + 0.03 * H)],
                   line * 0.8)
    elif expression == 'asleep':
        for c in eyes:
            closed_eye(c)
    elif expression == 'dizzy':
        for c in eyes:
            t = np.linspace(0, 3.5 * pi, 80)
            k = t / t[-1]
            stroke(np.stack([c[0] + rx * k * np.cos(t), c[1] + rx * 0.92 * k * np.sin(t)], 1), line * 0.7)
        if mouth:
            x = np.linspace(mouth[0] - 0.06 * W, mouth[0] + 0.06 * W, 40)
            stroke(np.stack([x, mouth[1] + 0.03 * H + np.sin((x - x[0]) / (0.12 * W) * 3 * pi) * 0.02 * H], 1),
                   line * 0.7)
    elif expression == 'cross':  # eyes cut by a brow sloping down toward the middle
        for i, c in enumerate(eyes):
            inner = 1 if i == 0 else -1

            def inside(xx, yy, c=c, inner=inner):
                m = ((xx - c[0]) / rx) ** 2 + ((yy - c[1]) / ry) ** 2 <= 1
                return m & (yy >= c[1] - ry * 0.3 + inner * (xx - c[0]) * 0.55 * ry / rx)

            paint(c[0] - rx, c[1] - ry, c[0] + rx, c[1] + ry, inside)
            pupil(c, rx, ry, clip=lambda xx, yy, c=c, inner=inner: yy >= c[1] - ry * 0.3 + inner * (xx - c[0]) * 0.55 * ry / rx)
        frown()
    else:
        raise ValueError(f'unknown expression {expression!r}; one of {FACES}')
    return kit.downscale(img, 2)


def eyes_image(glow_hex, layout='bolt', expression='neutral'):
    img = kit.image_from_array(f'Eyes.{layout}', face_pixels(expression, glow_hex, layout))
    img['layout'] = layout
    return img


def face_material(eyes, visor_hex):
    """The screen, with the face glowing behind the glass (renders only; the site draws
    its own)."""
    mat = kit.material('Screen', visor_hex, roughness=0.25)
    nt = mat.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = eyes
    bsdf = nt.nodes['Principled BSDF']
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 1.8
    return mat
