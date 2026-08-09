# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Fuding Meat Slice Ordering V2
**Generated:** 2026-08-09 02:30:56
**Category:** Restaurant/Food Service

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#A9402B` | `--color-primary` |
| Secondary | `#2F6B4F` | `--color-secondary` |
| CTA/Accent | `#C97824` | `--color-cta` |
| Background | `#F7F3EA` | `--color-background` |
| Surface | `#FFFCF7` | `--color-surface` |
| Text | `#2A211C` | `--color-text` |

**Color Notes:** 辣椒红、汤底米白和少量青绿。后台以中性表面为主，红色只用于主操作和关键状态。

### Typography

- **Heading Font:** Noto Sans SC
- **Body Font:** Noto Sans SC
- **Mood:** chinese, simplified, modern, professional, multilingual, readable
- **Font Stack:** `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif`
- 不依赖运行时下载的网页字体，优先使用设备自带中文字体。

### Spacing Variables

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #A9402B;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #A9402B;
  border: 1px solid #A9402B;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #FFFCF7;
  border-radius: 12px;
  padding: 24px;
  border: 1px solid #E8E0D5;
  box-shadow: var(--shadow-sm);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  border-color: #D7C9BA;
  box-shadow: var(--shadow-md);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #A9402B;
  outline: none;
  box-shadow: 0 0 0 3px #A9402B24;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Warm, clean and operational

**Keywords:** warm food palette, clear hierarchy, restrained surfaces, tactile controls, operational clarity

**Best For:** Chinese food ordering, stall operations, quick order handling

**Key Effects:** 150-200ms state transitions, clear focus rings, subtle elevation, no decorative motion

### Page Pattern

**Pattern Name:** Task-first responsive layout

- **Customer:** Mobile-first menu, persistent cart summary, one clear checkout action.
- **Merchant:** Desktop sidebar with dense but readable work areas; mobile navigation keeps all actions reachable.
- **CTA Placement:** Primary action aligned with the current task; destructive actions visually separated.
- **Hierarchy:** Page title, concise status/context, task content, then secondary help.

---

## Anti-Patterns (Do NOT Use)

- ❌ Low-quality imagery
- ❌ Outdated hours
- ❌ Chatbot copy, AI assistant framing, fake insight cards, decorative prompt language
- ❌ Full-page gradients, excessive red surfaces, glassmorphism, oversized marketing headlines
- ❌ Reusing V1 page CSS or preserving legacy layout solely for compatibility

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
