"""Renders the Eudaimonai app icon: a flat silver ring with a silver core on
night blue (#080B1C). Chosen by Clemens on 4 Oct 2026 ("B · Flach Silber")
over the lit relief version, white on ultramarine, an ultramarine mark and a
glass version: it matches the flat score rings in the Lab and stays crisp at
16 px. The silver is solid platinum with one soft diagonal sheen; no relief,
no shadow on the mark.

    python3 docs/brand/render-silver-icon.py
writes, next to this file:
  eudaimonai-icon-1024.png        full-bleed (website, iOS touch icon)
  eudaimonai-icon-macos-1024.png  on Apple's icon grid (app bundle, Dock)
"""
import numpy as np
from PIL import Image, ImageFilter
import os, math
OUT = os.path.dirname(os.path.abspath(__file__))
N = 2048
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
X = (xx + .5) / N * 2 - 1; Y = (yy + .5) / N * 2 - 1   # -1..1, y down

def env(rx, ry, rz):
    """Bright silver studio: light walls, soft horizon, two softboxes, grey floor."""
    up = -ry
    base = np.where(up > 0, 0.62 + 0.30 * up, 0.38 + 0.22 * (1 + up))
    horizon = np.exp(-((up - 0.0) / 0.16) ** 2) * 0.22
    dark = np.exp(-((up + 0.35) / 0.14) ** 2) * -0.20                       # dark band below horizon: the metal "edge"
    soft1 = np.exp(-(((rx + 0.38) / 0.24) ** 2 + ((up - 0.60) / 0.16) ** 2)) * 1.2
    soft2 = np.exp(-(((rx - 0.58) / 0.12) ** 2 + ((up - 0.20) / 0.34) ** 2)) * 0.7
    side = np.exp(-((rx + 0.85) / 0.15) ** 2) * -0.18
    return base + horizon + dark + soft1 + soft2 + side

def shade(nx, ny, nz, mask, tint=(0.95, 0.97, 1.0), rough=0.0):
    # view along -z; reflection r = 2(n·v)n - v with v=(0,0,1)
    rx, ry, rz = 2 * nz * nx, 2 * nz * ny, 2 * nz * nz - 1
    e = env(rx, ry, rz)
    fres = 0.85 + 0.15 * (1 - nz) ** 5
    spec = np.clip((nx * -0.45 + ny * -0.55 + nz * 0.70), 0, 1) ** 80 * 1.4
    val = np.clip(e * fres + spec, 0, 1.25)
    val = val / (1 + 0.22 * val)                                            # filmic shoulder
    rgb = np.stack([val * t for t in tint], -1)
    return rgb, mask

def canvas(bg=(8, 11, 28)):
    img = np.zeros((N, N, 3), np.float32); img[:] = np.array(bg) / 255
    r = np.hypot(np.maximum(np.abs(X) - (1 - 0.445), 0), np.maximum(np.abs(Y) - (1 - 0.445), 0))
    alpha = np.clip((0.445 - r) * N / 2, 0, 1)                              # squircle-ish rounded rect
    return img, alpha

def comp(img, rgb, mask):
    m = mask[..., None]; return img * (1 - m) + rgb * m

def shadow(img, mask, dy=0.03, blur=40, strength=0.75):
    sh = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))
    sh = np.roll(np.asarray(sh, np.float32) / 255, int(dy * N / 2), axis=0)
    return img * (1 - strength * sh[..., None])

def torus(cx, cy, R, r, arc=None):
    d = np.hypot(X - cx, Y - cy); t = (d - R) / r
    mask = np.clip((1 - np.abs(t)) * r * N / 2, 0, 1)
    if arc is not None:
        ang = (np.arctan2(X - cx, -(Y - cy)) / (2 * math.pi)) % 1
        mask = mask * (ang <= arc)
    tt = np.clip(t, -1, 1); nz = np.sqrt(1 - tt ** 2)
    ux, uy = (X - cx) / (d + 1e-6), (Y - cy) / (d + 1e-6)
    return tt * ux, tt * uy, nz, mask

def sphere(cx, cy, r):
    dx, dy = (X - cx) / r, (Y - cy) / r; q = dx ** 2 + dy ** 2
    mask = np.clip((1 - np.sqrt(q)) * r * N / 2, 0, 1)
    nz = np.sqrt(np.clip(1 - q, 0, 1)); return np.clip(dx, -1, 1), np.clip(dy, -1, 1), nz, mask

def brushed_disc(cx, cy, R, lobes=4):
    d = np.hypot(X - cx, Y - cy); mask = np.clip((R - d) * N / 2, 0, 1)
    ang = np.arctan2(Y - cy, X - cx)
    conic = 0.5 + 0.5 * np.cos(lobes * ang + 0.6)                           # anisotropic radial brushing
    rng = np.random.default_rng(3); streak = rng.normal(0, 1, 720)
    idx = ((ang + math.pi) / (2 * math.pi) * 719).astype(int)
    v = 0.42 + 0.48 * conic ** 1.6 + 0.025 * streak[idx]
    v = v / (1 + 0.3 * v)
    rgb = np.stack([v * 0.95, v * 0.97, v * 1.0], -1); return rgb, mask

def save(name, img, alpha):
    a = (alpha * 255).astype(np.uint8)
    rgba = np.dstack([(np.clip(img, 0, 1) * 255).astype(np.uint8), a])
    Image.fromarray(rgba).resize((1024, 1024), Image.LANCZOS).save(f'{OUT}/{name}.png')


_, _, _, ring = torus(0, 0, 0.52, 0.085)
_, _, _, core = sphere(0, 0, 0.20)
mark = np.maximum(ring, core)
img, A = canvas()
sheen = 0.80 + 0.12 * np.clip(-(X + Y) * 0.6, -1, 1)
save('eudaimonai-icon-1024', comp(img, np.stack([sheen * .94, sheen * .96, sheen], -1), mark), A)

# macOS app icon grid (Big Sur and later): the artwork sits at 824 px inside a
# transparent 1024 px canvas with a soft drop shadow, so it matches the size of
# neighbouring Dock icons. iOS and the website use the full-bleed version.
full = Image.open(f'{OUT}/eudaimonai-icon-1024.png').convert('RGBA')
body = full.resize((824, 824), Image.LANCZOS)
canvas_ = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
shadow_ = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
alpha = body.getchannel('A').point(lambda a: int(a * 0.32))
shadow_.paste(Image.new('RGBA', (824, 824), (0, 0, 0, 255)), (100, 112), alpha)
shadow_ = shadow_.filter(ImageFilter.GaussianBlur(14))
canvas_.alpha_composite(shadow_)
canvas_.alpha_composite(body, (100, 100))
canvas_.save(f'{OUT}/eudaimonai-icon-macos-1024.png')
