"""The library's texture kit, ready to ship: greyscale, seams softened, every tiling map at
the same mean grey (so a part keeps its palette colour on average once the material colour is
lifted by 1/mean) with a contrast chosen per material, sized for how big it shows, as webp.
Reads the originals beside it (NAME.webp, as generated, kept at quality 95) and writes models/tex/NAME.webp and prints each map's mean in sRGB and in linear light."""
from pathlib import Path
import numpy as np
from PIL import Image

here = Path(__file__).parent
out = here.parent.parent / 'models' / 'tex'  # the shipping maps
out.mkdir(exist_ok=True)

MEAN = 216  # every tiling map's mean grey (sRGB 0..255)
# name: (size px, target standard deviation at MEAN, source)
KIT = {
    'wood': (1024, 18, 'wood'),  # cases, the stand, panelling: the grain should read
    'planks': (1024, 22, 'planks'),  # floorboards: seams and boards should read
    'plaster': (1024, 8, 'plaster'),  # the wall above the rail: barely there
    'damask': (1024, 10, 'damask'),  # alternative wall paper: quiet
    'bookcloth': (512, 18, 'bookcloth'),  # buckram spines
    'leather': (512, 16, 'leather'),  # leather spines
    'velvet': (512, 16, 'velvet'),  # cushions (herringbone wool)
}


def soften_seams(a, k=5, sigma=1.6):
    """Blur across the wrap edges only (a band k px each side), so tiling shows no step."""
    w = np.exp(-0.5 * (np.arange(-3, 4) / sigma) ** 2)
    w /= w.sum()
    for axis in (0, 1):
        a = np.roll(a, k, axis=axis)  # the seam now sits between k-1 and k
        band = np.take(a, range(-3, 2 * k + 3), axis=axis, mode='wrap')
        blurred = sum(wi * np.roll(band, s, axis=axis) for wi, s in zip(w, range(-3, 4)))
        blurred = np.take(blurred, range(3, 2 * k + 3), axis=axis)
        orig = np.take(a, range(0, 2 * k), axis=axis)
        # Full blur at the seam, none at the band's ends.
        t = 1 - np.abs(np.arange(2 * k) - (k - 0.5)) / k
        shape = [1, 1]
        shape[axis] = 2 * k
        t = t.reshape(shape)
        mixed = orig * (1 - t) + blurred * t
        if axis == 0:
            a[: 2 * k] = mixed
        else:
            a[:, : 2 * k] = mixed
        a = np.roll(a, -k, axis=axis)
    return a


def resize_tile(a, size):
    """Resize a tiling map without breaking its wrap: resize 3x3 of it, keep the middle."""
    h, w = a.shape
    big = Image.fromarray(np.tile(a, (3, 3)).astype(np.float32), mode='F')
    big = big.resize((size * 3, size * 3), Image.LANCZOS)
    return np.asarray(big)[size : 2 * size, size : 2 * size]


def levels(a, mean, sd):
    return np.clip(mean + (a - a.mean()) * (sd / a.std()), 0, 255)


def seam_ratio(a):
    ix = np.abs(np.diff(a, axis=1)).mean()
    iy = np.abs(np.diff(a, axis=0)).mean()
    return np.abs(a[:, -1] - a[:, 0]).mean() / ix, np.abs(a[-1] - a[0]).mean() / iy


def lin(v):
    v = v / 255
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


for name, (size, sd, src) in KIT.items():
    a = np.asarray(Image.open(here / f'{src}.webp').convert('L'), dtype=np.float64)
    a = soften_seams(a)
    a = resize_tile(a, size)
    a = levels(a, MEAN, sd)
    sx, sy = seam_ratio(a)
    Image.fromarray(a.round().astype(np.uint8), 'L').save(out / f'{name}.webp', quality=86, method=6)
    print(f'{name:10s} {size}px  mean {a.mean():5.1f} (linear {lin(a).mean():.3f})  sd {a.std():4.1f}  seams {sx:.2f} {sy:.2f}')

# The rug: one whole picture, not a tile. Lighter field, its own contrast kept (a touch more).
a = np.asarray(Image.open(here / 'rug.webp').convert('L'), dtype=np.float64)
img = Image.fromarray(a.astype(np.float32), mode='F').resize((1536, 1024), Image.LANCZOS)
a = levels(np.asarray(img), 200, a.std() * 1.25)
Image.fromarray(a.round().astype(np.uint8), 'L').save(out / 'rug.webp', quality=88, method=6)
print(f'rug        1536x1024  mean {a.mean():5.1f} (linear {lin(a).mean():.3f})  sd {a.std():4.1f}')
for f in sorted(out.glob('*.webp')):
    print(f.name, f.stat().st_size // 1024, 'KB')
