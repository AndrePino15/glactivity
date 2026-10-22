"""Cut the six squirrel poses out of the illustration sheet.

    pip install numpy pillow scipy
    python design/mascot/cut_poses.py design/mascot/squirrel-sheet.webp design/mascot/poses

Removes the white paper (and the painted ground streaks) so the poses sit on
both the day and the night theme.
"""
import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
SRC = sys.argv[1]; OUT = sys.argv[2]
im = np.asarray(Image.open(SRC).convert('RGB')).astype(float)
POSES = {  # name: (y0, y1, x0, x1) from the component search, padded below
  'standing':    (53, 497, 13, 432),
  'running':     (138, 464, 438, 1038),
  'stashing':    (65, 492, 1097, 1508),
  'lounging':    (560, 954, 5, 590),
  'snacking':    (564, 957, 621, 1026),
  'celebrating': (506, 978, 1070, 1521),
}
PAD = 10
H, W, _ = im.shape
for name, (y0, y1, x0, x1) in POSES.items():
    y0, x0 = max(0, y0 - PAD), max(0, x0 - PAD); y1, x1 = min(H, y1 + PAD), min(W, x1 + PAD)
    c = im[y0:y1, x0:x1]
    w = c.min(axis=2); chroma = c.max(axis=2) - w
    # Paper: near-white, plus pale low-chroma paint (ground streaks) reachable from it.
    paper = w >= 238
    pale = (w >= 165) & (chroma < 75)
    # Painted ground streaks: tan strokes along the bottom edge.
    r, g = c[..., 0], c[..., 1]
    ground = (w >= 95) & (chroma < 150) & (g >= 0.74 * r)
    ground[: int(c.shape[0] * 0.86)] = False
    pale |= ground
    lab, n = ndi.label(pale | paper)
    border = np.zeros_like(paper); border[0, :] = border[-1, :] = border[:, 0] = border[:, -1] = True
    sizes = ndi.sum(paper, lab, index=np.arange(1, n + 1))
    keep = set(np.unique(lab[border & (lab > 0)])) | {i + 1 for i, s in enumerate(sizes) if s >= 150}
    bg = np.isin(lab, list(keep - {0}))
    # Soft edge: inside a thin band next to the paper, opacity follows how un-white the paint is.
    near = ndi.distance_transform_edt(~bg) <= 3
    soft = np.clip((250 - w) / 70, 0, 1)
    a = np.where(bg, 0.0, np.where(near, soft, 1.0))
    a = ndi.gaussian_filter(a, 0.6) * (~bg | (a > 0))
    # Un-mix the white paper out of semi-transparent edge pixels.
    aa = np.maximum(a, 1e-3)[..., None]
    fg = np.clip((c - 255 * (1 - aa)) / aa, 0, 255)
    # Drop stray specks left over from the paper.
    lab2, n2 = ndi.label(a > 0.08)
    if n2:
        sizes2 = ndi.sum(np.ones_like(a), lab2, index=np.arange(1, n2 + 1))
        a[np.isin(lab2, [i + 1 for i, s2 in enumerate(sizes2) if s2 < 40])] = 0
    rgba = np.dstack([fg, a[..., None] * 255]).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    img = img.crop(img.getbbox())
    img.save(f'{OUT}/{name}.png')
    print(name, img.size)
