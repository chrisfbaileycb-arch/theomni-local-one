---
name: omnilocal-design
description: OmniLocal's design system — "Old Money Tech meets Mom-and-Pop Warmth." Use whenever building, editing, or reviewing any frontend component, page, style, or UI copy in this repo, so every new surface inherits the same visual polish.
---

# OmniLocal Design Doctrine

Identity: **"Old Money Tech meets Mom-and-Pop Warmth."** Editorial serif elegance +
technical monospace precision + warm, unpretentious surfaces. Light theme ONLY —
never introduce a dark theme.

## Typography — three roles, never mixed

| Role | Class | Face | Use for |
|---|---|---|---|
| Display | `.serif` | Cormorant Garamond | H1s, section titles, brand moments. Slightly tight letter-spacing. |
| Body | (default) | Manrope | Everything else: UI, buttons, nav, descriptions. |
| Data | `.mono` | JetBrains Mono | ALL money, ROAS, metrics, counts, dates. No exceptions — numbers in Manrope read as unconsidered. |

`.serif` and `.mono` are defined in `frontend/src/index.css`. **Before using any
utility class, confirm it exists there** — this repo once shipped with `.serif`
referenced in 20 files and defined nowhere.

## Color tokens (CSS custom properties — never hardcode hex in components)

- Grounds: `--bone` #FDFCF8 (app), `--surface` #FFFFFF (cards), `--surface-alt` #F4F1EA (nested)
- Ink: `--ink` #1A1A1A, `--ink-2` #5C5A56 (secondary)
- Brand: `--brand` #D35400 (burnt orange) — the ONE accent; spend it sparingly
- Semantic: `--green` #27AE60 (**reserved for money/success — a green number means revenue**), `--amber` #F39C12, `--red` #C0392B, `--blue` #2980B9
- Border: `--border` #E8E6DF
- Aliases exist (`--primary`, `--text`, `--text-secondary`, `--success`, `--danger`, `--info`, `--bg`) — fine to use.

## Surfaces & shape

- Cards: `.card` — white, 1px `--border`, rounded (8–12px), ambient shadow
  `0 4px 24px -6px rgba(0,0,0,0.05)`. Hoverable cards add `.lift`.
- Buttons: **pill-shaped** (`border-radius: 999px`) via `.btn` + `.btn-primary`/`.btn-ghost`.
- Inner elements: 6px radius. Nothing chunkier than 12px.
- No transparent headers/overlays — solid white or backdrop-blur with a white tint.

## Motion

- Cards: `.lift` = translateY(-4px) + orange-tinted shadow, 300ms ease-out.
- Buttons: subtle rise on hover, `scale(0.96)` on press.
- Page load: framer-motion stagger — `initial={{opacity:0, y:10}}`, `animate={{opacity:1, y:0}}`, `staggerChildren: 0.1` (or the CSS `.rise` keyframe).
- Target specific properties (`transition-transform`, `transition-colors`) — **never `transition: all`**.
- Everything respects `prefers-reduced-motion` (handled globally in index.css).

## Spacing

Generous, always: `p-6`/`p-8` inside cards, `gap-8`/`gap-12` between sections,
`max-w-7xl` centered container with `px-4 sm:px-6 lg:px-8`. When a layout feels
comfortable, add more space — cramped reads as cheap.

## Hard rules

1. Light theme only. No dark mode, ever.
2. Never center-align the app container.
3. Every interactive element: a visible hover state, a `data-testid`
   (kebab-case), and keyboard focus (global `:focus-visible` ring exists — don't
   suppress it).
4. Icons come from Lucide — never emoji.
5. Green text = money. Don't use `--green` decoratively.
6. Polish over rewrite: elevate existing layouts with these tokens; don't
   restructure working pages to restyle them.
7. Contrast: `--ink` on bone/white; never `--ink-2` for essential copy under 14px.

## Voice in UI copy

Warm, direct, owner-to-owner. "Your engine", "Run next week", "Film once, reuse
forever." Never corporate ("utilize", "leverage"), never hype ("revolutionary").
Money framing is concrete: "$299/week split across two strategies", not
"optimized budget allocation".
