# Design

## Mascot

A painted red squirrel, from `mascot/squirrel-sheet.webp`. `mascot/cut_poses.py` cuts the six poses out of the sheet onto transparent backgrounds (`mascot/poses/*.png`). The app serves WebP copies from `apps/web/public/mascot/` through the `Mascot` component.

| Pose | Where it appears |
|---|---|
| `standing` | App icon, sign-in, sidebar logo |
| `running` | Timetable |
| `stashing` (arms full of acorns) | Lists |
| `snacking` (eating an acorn) | Lifestyle |
| `celebrating` (falling leaves) | Fun |
| `lounging` (on a branch) | Bottom of Today |

`mascot/app-icon.png` (1024px, standing squirrel on cream) is the source for the PNG icons in `apps/web/public/icons/` and `apps/web/src/app/{icon,apple-icon}.png`.

## Tokens

Defined once in `apps/web/src/app/globals.css` with `light-dark()`, so every colour carries its day and night value side by side.

| Token | Day | Night |
|---|---|---|
| `--bg` | `#F5F3EE` warm paper | `#0B1026` deep navy |
| `--surface` (cards) | `#FCFBF8` | `#151B36` |
| `--text` | `#1D1B18` | `#EEF0F8` |
| `--text-secondary` | `#6B665E` | `#9AA1BD` |
| `--accent` (buttons, selected states) | `#1D1B18` ink | `#F2EAD9` cream |

There is no brand colour: the squirrel is the only colour on the page. Event categories have their own quiet colours, used only as the thin edge next to an event's time (`--cat-lecture`, `--cat-exam`, `--cat-gym`, `--cat-meal`, `--cat-social`, `--cat-personal`).

Type follows Apple's text styles (`--text-large-title` 34pt down to `--text-caption` 12pt) using the system font, which is SF Pro on iPhone and Mac.

## Layout rules

- No boxes or icon tiles for their own sake. Content sits on the page as rows with hairline dividers (`List` / `Row` in `apps/web/src/components/ui.tsx`).
- Space separates sections; a section only renders when it has something to show.
- One primary button per screen (ink/cream). Everything else is a plain text action.
- Everything tappable shows a soft highlight on hover (pointer devices only), so you can see what you're about to press.
- Daily games use small drawn icons (`apps/web/src/components/fun/GameIcon.tsx`) that echo each game's look without copying its logo.
