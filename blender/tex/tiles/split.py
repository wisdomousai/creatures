"""Cut a 1536x1024 room picture into 3x3 overlapping crops, each blown up to 1536x1024 for
Codex to repaint in detail (tile.sh): python3 split.py NAME, in the work folder (reads
NAME-ref.png, writes tiles/NAME-I-J-crop.png)."""
import sys
from PIL import Image
C, N = 0.38, 3  # each crop's share of the picture across and down; crops each way
name = sys.argv[1]
im = Image.open(f'{name}-ref.png').convert('RGB')
W, H = im.size
for j in range(N):
    for i in range(N):
        x0, y0 = i * (1 - C) / (N - 1) * W, j * (1 - C) / (N - 1) * H
        im.crop((round(x0), round(y0), round(x0 + C * W), round(y0 + C * H))).resize(
            (1536, 1024), Image.LANCZOS).save(f'tiles/{name}-{i}-{j}-crop.png')
