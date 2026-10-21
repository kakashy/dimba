# Dimba — Design System

> Impeccable design record. New surface, replacement world (no incumbent design).
> Mode: **Operate** (utility app; scanability + speed over expression).

## Point of view

**"Pitch-side clipboard."** Dimba should feel like a matchday team sheet: sturdy,
legible at arm's length, built for quick confident marks — not like a betting
app (dense, loud, anxious) and not like a generic dashboard. Calm confidence,
sporting energy only at the moments that matter (prize, save, score).

## Color

Light theme default; dark theme available (ModeWatcher).

| Token | Light | Role |
|---|---|---|
| `primary` | pitch green `oklch(0.45 0.115 158)` (~#0B5D3B) | selected picks, save, brand |
| `primary-foreground` | warm white | on primary |
| `lime` | electric lime `oklch(0.87 0.2 118)` | score chips, highlights, jackpot |
| `background` | green-tinted near-white `oklch(0.988 …)` | page |
| `foreground` | green-black ink | text |
| `success` | green `oklch(0.55 0.13 150)` | correct pick ✓ |
| `destructive` | `oklch(0.55 0.2 25)` | wrong pick ✗ |
| `muted` / `border` | soft green-greys | cards, dividers |

Dark: deep green-black surfaces, primary flips to light green. All pairs ≥ WCAG AA;
critical pairs target AAA at large sizes.

## Typography

- **Atkinson Hyperlegible** (Braille Institute) — designed for low vision; the
  honest choice for a senior user. 400 / 700.
- Base **20px** (`body`), body copy 1.6 line-height.
- Display: `h1 clamp(2rem, 5vw, 2.75rem)` bold; prize amount + scores use
  `font-variant-numeric: tabular-nums` and can exceed 3rem (count-up on reveal).
- Fixture team names ≥ 24px semibold/bold; labels short and plain
  ("Save Set A", "Results Tuesday").

## Shape, space, motion

- Radius: cards/buttons `--radius: 1rem` (16px), pills for chips.
- Rhythm: 24px card padding, 16px gaps, section spacing 32–48px.
- Tap targets: primary controls ≥ 56px tall (pick buttons 56–64px), secondary ≥ 48px.
- Motion: feedback only — press `scale(0.97)` + 100ms, save bar pulse on success,
  score count-up 600ms, no ambient animation. `prefers-reduced-motion` honored.
- Shadows: soft, low (`shadow-sm` cards; `shadow-lg` sticky save bar).

## Components (shadcn-svelte, style `vega`)

- `button` (default = primary green; `lg` size for big CTAs), `badge`,
  `card`, `tabs` (Set A/B/C segmented control — big, full-width segments).
- Custom: `PickButton` (Home / Draw / Away 56px+, selected = filled primary + ✓),
  `FixtureCard`, `ScoreChip` (lime chip `14/17` + tier label), `SaveBar`
  (sticky bottom: status text + save button + online/offline chip),
  `ResultRow` (✓/✗ icon + color + text, prediction → actual).

## Screens

1. **Home `/`** — jackpot header (name, prize huge, countdown), sticky Set tabs,
   17 fixture cards with pick buttons, sticky SaveBar. Empty state: big CTA
   "Start Set A".
2. **History `/history`** — past jackpots as cards with 3 score chips; expand →
   per-game ✓/✗ rows vs actual result; pending state "Results Tuesday".
3. **Onboarding card** — first visit: what this is, "Add to Home Screen" hint
   (iOS), optional notifications enable (after first save).

## Icons & imagery

- `@lucide/svelte`; icons always paired with text for critical actions.
- No photography. App icon: flat "D" monogram, lime on pitch green, maskable.

## Voice

Plain, warm, direct. "Saved ✓", "3 picks left", "Results Tuesday", never jargon
("replication", "outbox"). Kiswahili word "Dimba" = guess; used as brand only,
UI in English.
