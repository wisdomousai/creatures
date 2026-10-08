"""Stitch the 3x3 repainted crops (tiles/NAME-I-J.png) back into one picture, blended across
their overlaps, at 3840x2560 (tile.sh): python3 stitch.py NAME, in the work folder (writes
NAME.png)."""
import sys
import numpy as np
from PIL import Image
C, N, TW, TH = 0.38, 3, 1536, 1024
name = sys.argv[1]
s = TW / C  # the whole picture's width at the tiles' scale
FW, FH = round(s), round(TH / C)
acc = np.zeros((FH, FW, 3)); wsum = np.zeros((FH, FW, 1))
ov = (C - (1 - C) / (N - 1))  # overlap, as a share of the picture
for j in range(N):
    for i in range(N):
        t = np.asarray(Image.open(f'tiles/{name}-{i}-{j}.png').convert('RGB').resize((TW, TH), Image.LANCZOS), float)
        x0, y0 = round(i * (1 - C) / (N - 1) * FW), round(j * (1 - C) / (N - 1) * FH)
        # Weights ramp across the overlap on each side that has a neighbour.
        rx, ry = ov / C * TW, ov / C * TH
        wx = np.ones(TW); wy = np.ones(TH)
        if i > 0: wx = np.minimum(wx, np.clip(np.arange(TW) / rx, 0, 1))
        if i < N - 1: wx = np.minimum(wx, np.clip((TW - 1 - np.arange(TW)) / rx, 0, 1))
        if j > 0: wy = np.minimum(wy, np.clip(np.arange(TH) / ry, 0, 1))
        if j < N - 1: wy = np.minimum(wy, np.clip((TH - 1 - np.arange(TH)) / ry, 0, 1))
        w = (wy[:, None] * wx[None, :])[..., None] + 1e-6
        h, ww = min(TH, FH - y0), min(TW, FW - x0)
        acc[y0:y0 + h, x0:x0 + ww] += t[:h, :ww] * w[:h, :ww]
        wsum[y0:y0 + h, x0:x0 + ww] += w[:h, :ww]
out = Image.fromarray(np.clip(acc / wsum, 0, 255).astype(np.uint8))
out.resize((3840, 2560), Image.LANCZOS).save(f'{name}.png')
print(name, out.size, '->', (3840, 2560))
