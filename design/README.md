# Design

## Mascot

`mascot/squirrel.svg` is the source artwork. The web app renders an inline copy (`apps/web/src/components/Squirrel.tsx`). Keep the two in sync when the squirrel changes.

`mascot/app-icon.svg` and `mascot/app-icon-maskable.svg` (more padding, for Android's masks) are the home-screen icons. The PNGs in `apps/web/public/icons/` and `apps/web/src/app/apple-icon.png` are rendered from them.

## Tokens

Defined once in `apps/web/src/app/globals.css` with `light-dark()`, so every colour carries its day and night value side by side.

| Token | Day | Night |
|---|---|---|
| `--bg` | `#F5F3EE` warm paper | `#0B1026` deep navy |
| `--surface` (cards) | `#FCFBF8` | `#151B36` |
| `--text` | `#1D1B18` | `#EEF0F8` |
| `--text-secondary` | `#6B665E` | `#9AA1BD` |
| `--accent` | `#B8622A` chestnut | `#E8A15F` amber |

Event categories have their own colours (`--cat-lecture`, `--cat-exam`, `--cat-gym`, `--cat-meal`, `--cat-social`, `--cat-personal`).

Type follows Apple's text styles (`--text-large-title` 34pt down to `--text-caption` 12pt) using the system font, which is SF Pro on iPhone and Mac.
