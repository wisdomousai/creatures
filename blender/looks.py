"""The crew's looks, from the site's tokens (src/styles/global.css): paper #f4f4f1, ink
#111111, ink-soft #55554f. Everything is matte; only the face screens have a little
gloss. The site builds its own materials from the same table (looks.ts); here they are
for the Blender previews, and their names tell the site which part is which.
"""

import json
import os

import faces
import kit

LOOKS = {
    # A small ink robot on the page, with a paper-white face.
    'ink': dict(shell='#1c1c1b', joint='#55554f', visor='#060606', bezel='#55554f', glow='#f4f4f1',
                outline=None, flame='beacon'),
    # A paper robot drawn in ink, like the page's own line work.
    'paper': dict(shell='#f4f4f1', joint='#55554f', visor='#111111', bezel='#111111', glow='#f4f4f1',
                  outline='#111111', flame='glow'),
    # Every creature in its own colours, from the palettes below.
    'colour': dict(shell='#f4f4f1', joint='#55554f', visor='#111111', bezel='#55554f', glow='#f4f4f1',
                   outline=None, flame='beacon'),
}
# The colour look's palettes, shared with the site: per character, base colours over
# the look's, colours for parts with their own role (see role() below), and the colours
# of a blinking dot, off then on.
with open(os.path.join(os.path.dirname(__file__), '..', 'src', 'palettes.json')) as f:
    PALETTES = json.load(f)
# Rocket flames either glow paper-white or take the antenna beacon's colour, so the one
# colour a robot has shows twice. White flames nearly vanish on the ink look.
FLAMES = ('beacon', 'glow')
OUTLINE = 0.006  # metres; about a pixel at Bolt's size on the site
# Which of its coats a character with several (the cats: 'coats' in palettes.json) wears
# in the colour look's previews; None wears its base colours. The site picks one at random.
COAT = None


def materials(look, flame=None, face='bolt', palette=None):
    """The look's materials: shell, joint, bezel, glow, beacon, flame, face (the screen
    with that character's face layout), outline (or None), dot(i) for glowing dots, and
    role(name, base) for a part with a colour of its own in the colour look. `palette`
    names the colour look's palette when it isn't the face's (a decoration's)."""
    palette = PALETTES.get(palette or face, {}) if look == 'colour' else {}
    if palette.get('coats') and COAT is not None:
        coat = palette['coats'][COAT % len(palette['coats'])]
        palette = {**palette, 'base': {**palette.get('base', {}), **coat.get('base', {})},
                   'roles': {**palette.get('roles', {}), **coat.get('roles', {})}}
    c = {**LOOKS[look], **palette.get('base', {})}
    flame = flame or c['flame']
    dots = palette.get('dots', (c['glow'], c['glow']))
    roles, dot_mats = {}, {}

    def dot(i):
        """Dot{i}: one material per dot, shared by every part that lights with it."""
        if i not in dot_mats:
            dot_mats[i] = kit.material(f'Dot{i}', dots[1], roughness=0.5, emission=dots[1], emission_strength=1.6)
        return dot_mats[i]

    def role(name, base='shell'):
        """A part that is its base part in the other looks and takes its own colour in the
        colour look: the site reads the material name, Base_Role."""
        key = f'{base.capitalize()}_{name}'
        if key not in roles:
            colour = palette.get('roles', {}).get(name, c[base])
            roles[key] = kit.material(key, colour, roughness=0.6 if base == 'shell' else 0.55)
        return roles[key]

    m = {
        'shell': kit.material('Shell', c['shell'], roughness=0.6),
        'joint': kit.material('Joint', c['joint'], roughness=0.55),
        'bezel': kit.material('Bezel', c['bezel'], roughness=0.55),
        'glow': kit.material('Glow', c['glow'], roughness=0.5, emission=c['glow'], emission_strength=1.6),
        # The beacon gets its own material so the site can change its colour.
        'beacon': kit.material('Beacon', c['glow'], roughness=0.5, emission=c['glow'], emission_strength=1.6),
        'face': faces.face_material(faces.eyes_image(c['glow'], face), c['visor']),
        'outline': None,
        # Dots that blink one by one (the ladybug's): one material each, Dot0, Dot1, ...
        'dot': dot,
        'role': role,
    }
    m['flame'] = m['beacon'] if flame == 'beacon' else kit.material(
        'Flame', c['glow'], roughness=0.5, emission=c['glow'], emission_strength=2.5)
    if c['outline']:
        m['outline'] = kit.material('Outline', c['outline'], roughness=1.0)
        m['outline'].use_backface_culling = True
    return m


def finish(rig, parts, skin, m, outline=OUTLINE):
    """Bind every part to the rig, then add the paper look's outlines (last, so they
    follow the rig's deformation)."""
    for obj, bone in skin:
        kit.bind(obj, rig, bone)
    if m['outline']:
        for obj in parts:
            kit.outline(obj, m['outline'], outline)
    return rig, parts
