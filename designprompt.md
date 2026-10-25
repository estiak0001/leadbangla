# LeadBangla — Complete Design System & Redesign Prompt

> **Scope:** Full-stack frontend redesign for both `frontend/main-app` and `frontend/admin-panel`.
> Every prompt section below is self-contained and can be handed to an implementation agent.

---

## 0 · Design Audit — Current State

| Area | Current | Problem |
|---|---|---|
| Navigation | 13 links in a horizontal top bar | Overflows and breaks on mobile; no active state |
| Layout | Single top header + `max-w-5xl` main | No sidebar; pages feel cramped and unstructured |
| Background | Flat `bg-gray-50` | No depth, no visual hierarchy |
| Cards | White + gray border + `shadow-sm` | Flat, generic, no personality |
| Typography | Browser defaults via Tailwind reset | No font stack, no scale customisation |
| Color system | Raw Tailwind values inline everywhere | No semantic tokens, inconsistent across pages |
| Tailwind config | Completely empty `extend: {}` | Zero design tokens — everything is ad-hoc |
| Icons | None | Text-only UI looks dated |
| Animations | Hover-only on buttons | No skeleton loaders, no transitions |
| Mobile | Not considered | Nav, tables, and forms break below `lg` |
| Admin panel | Identical copy of main-app layout | No visual distinction; looks like an accident |

---

## 1 · Design Philosophy & Visual Identity

### Brand Personality
LeadBangla is a **local-first B2B SaaS** tool for Bangladeshi marketers.
The visual language should feel:
- **Trustworthy and professional** — not playful, not enterprise-cold
- **Modern and clean** — generous whitespace, clear hierarchy
- **Warm** — the market is relationship-driven; avoid clinical blue-grey

### Aesthetic Direction
- **Soft-UI meets flat design** — subtle depth without skeuomorphism
- **Micro-surfaces** — layered backgrounds (page → section → card → input) create depth without shadows
- **Muted gradient accents** — brand colour gradients on hero sections and sidebar; white surfaces everywhere else
- **Generous whitespace** — 24px default gap between cards, 32px section padding, 48px page padding on desktop

---

## 2 · Design Token System (Tailwind Config)

### 2a · Colour Palette

Implement the following in `tailwind.config.js` under `theme.extend.colors`:

```js
// Primary — Indigo (keep brand identity, refine shades)
brand: {
  50:  '#eef2ff',
  100: '#e0e7ff',
  200: '#c7d2fe',
  300: '#a5b4fc',
  400: '#818cf8',
  500: '#6366f1',   // primary action
  600: '#4f46e5',   // hover state
  700: '#4338ca',   // active / pressed
  800: '#3730a3',
  900: '#312e81',
},

// Neutral — Slate (warmer than gray, cooler than zinc)
surface: {
  0:   '#ffffff',   // card / input surface
  50:  '#f8fafc',   // page background
  100: '#f1f5f9',   // sidebar background / table header
  200: '#e2e8f0',   // border
  300: '#cbd5e1',   // disabled border
  400: '#94a3b8',   // placeholder / muted icon
  500: '#64748b',   // secondary text
  600: '#475569',   // body text
  700: '#334155',   // heading
  800: '#1e293b',   // strong heading
  900: '#0f172a',   // page title / logo
},

// Semantic status colours
success: { light: '#f0fdf4', base: '#22c55e', dark: '#15803d' },
warning: { light: '#fffbeb', base: '#f59e0b', dark: '#b45309' },
danger:  { light: '#fef2f2', base: '#ef4444', dark: '#b91c1c' },
info:    { light: '#eff6ff', base: '#3b82f6', dark: '#1d4ed8' },
```

### 2b · Typography

Add Inter from Google Fonts via `index.html`. Configure in tailwind:

```js
fontFamily: {
  sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
  mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
},
fontSize: {
  '2xs': ['0.625rem', { lineHeight: '0.875rem' }],   // 10px — micro labels
  xs:   ['0.75rem',  { lineHeight: '1rem'    }],     // 12px
  sm:   ['0.875rem', { lineHeight: '1.25rem' }],     // 14px — body secondary
  base: ['1rem',     { lineHeight: '1.5rem'  }],     // 16px — body primary
  lg:   ['1.125rem', { lineHeight: '1.75rem' }],     // 18px — card titles
  xl:   ['1.25rem',  { lineHeight: '1.75rem' }],     // 20px — section headings
  '2xl':['1.5rem',   { lineHeight: '2rem'    }],     // 24px — page headings
  '3xl':['1.875rem', { lineHeight: '2.25rem' }],     // 30px — hero sub-titles
  '4xl':['2.25rem',  { lineHeight: '2.5rem'  }],     // 36px — hero titles
  '5xl':['3rem',     { lineHeight: '1'       }],     // 48px — marketing hero
},
```

### 2c · Spacing & Radius

```js
borderRadius: {
  none: '0',
  sm:   '0.25rem',    // 4px  — badges, tags
  DEFAULT:'0.5rem',   // 8px  — inputs, small buttons
  md:   '0.75rem',    // 12px — cards
  lg:   '1rem',       // 16px — modals, sidebar items hover
  xl:   '1.5rem',     // 24px — hero cards, feature blocks
  '2xl':'2rem',       // 32px — marketing hero section
  full: '9999px',     // pills, toggles, avatar circles
},
boxShadow: {
  sm:  '0 1px 2px 0 rgb(0 0 0 / 0.04)',
  DEFAULT:'0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
  md:  '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
  lg:  '0 10px 15px -3px rgb(0 0 0 / 0.07), 0 4px 6px -4px rgb(0 0 0 / 0.04)',
  xl:  '0 20px 25px -5px rgb(0 0 0 / 0.08), 0 8px 10px -6px rgb(0 0 0 / 0.04)',
  'brand-glow': '0 0 0 3px rgb(99 102 241 / 0.15)',  // focus ring
  'card-hover': '0 8px 24px -4px rgb(99 102 241 / 0.12)',
},
```

### 2d · Global CSS (`index.css`)

Replace the current 3-line file with:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  *, *::before, *::after { box-sizing: border-box; }

  html { scroll-behavior: smooth; }

  body {
    @apply bg-surface-50 text-surface-600 font-sans antialiased;
    font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
  }

  /* Smooth focus rings everywhere */
  :focus-visible {
    @apply outline-none ring-2 ring-brand-500 ring-offset-2 ring-offset-white;
  }

  /* Scrollbar styling (webkit) */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { @apply bg-transparent; }
  ::-webkit-scrollbar-thumb { @apply bg-surface-300 rounded-full; }
  ::-webkit-scrollbar-thumb:hover { @apply bg-surface-400; }
}

@layer components {
  /* Page wrapper used by all authenticated pages */
  .page-container {
    @apply mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8;
  }

  /* Section label — UPPERCASE TRACKING LABEL above lists */
  .section-label {
    @apply text-xs font-semibold uppercase tracking-widest text-surface-400;
  }

  /* Status dot */
  .status-dot {
    @apply inline-block h-2 w-2 rounded-full flex-shrink-0;
  }
}
```

---

## 3 · Component Library Redesign

### 3a · Button (`src/components/Button.tsx`)

Redesign with size prop, icon support, and loading state:

```
Variants: primary | secondary | ghost | danger | success
Sizes:    xs | sm | md (default) | lg
States:   default | hover | active | disabled | loading

Primary:   bg-brand-500 → hover:bg-brand-600 · text-white · shadow-sm
Secondary: bg-white · border border-surface-200 · text-surface-700 · hover:bg-surface-50
Ghost:     bg-transparent · text-surface-600 · hover:bg-surface-100
Danger:    bg-danger.base → hover:bg-danger.dark · text-white
Success:   bg-success.base → hover:bg-success.dark · text-white

All buttons:
  rounded-md (md size) / rounded (sm,xs) / rounded-lg (lg)
  font-medium tracking-tight
  transition-all duration-150
  focus-visible: ring-2 ring-brand-500 ring-offset-2
  disabled: opacity-50 cursor-not-allowed pointer-events-none

Loading state: show a 14px spinner (CSS border-spin animation) replacing content
```

### 3b · Input (`src/components/Input.tsx`)

Add Label, HelperText, ErrorMessage, and prefix/suffix icon slots:

```
Structure:
  <div class="space-y-1.5">
    <label class="text-sm font-medium text-surface-700">...</label>
    <div class="relative flex items-center">
      [prefix icon slot — absolute left-3, text-surface-400, 16px]
      <input class="..." />
      [suffix slot — absolute right-3]
    </div>
    [helper text OR error message]
  </div>

Input base:
  block w-full rounded-md border border-surface-200 bg-white
  px-3 py-2.5 text-sm text-surface-800
  placeholder:text-surface-400
  transition-colors duration-150
  focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
  hover:border-surface-300

Error state:
  border-danger.base focus:border-danger.base focus:ring-danger.base/20
  helper text turns text-danger.dark

Disabled state:
  bg-surface-50 text-surface-400 cursor-not-allowed border-surface-200

Sizes:
  sm: py-1.5 text-xs
  md: py-2.5 text-sm  (default)
  lg: py-3 text-base
```

### 3c · Card (`src/components/Card.tsx`)

Add variants and hover interaction option:

```
Variants:
  default:  bg-white border border-surface-200 rounded-xl shadow-sm p-6
  elevated: bg-white rounded-xl shadow-md p-6 (no border)
  flat:     bg-surface-100 rounded-xl p-6 (no shadow, no border)
  bordered: bg-white border-2 border-brand-200 rounded-xl p-6

Interactive (hoverable prop):
  Add: cursor-pointer transition-all duration-200
  hover: shadow-card-hover -translate-y-0.5 border-brand-200

Inset (for table cards):
  p-0 overflow-hidden (apply padding to children manually)
```

### 3d · Badge (`src/components/Badge.tsx`) — New Component

```
Variants (maps to status semantics):
  default:  bg-surface-100 text-surface-600
  primary:  bg-brand-100 text-brand-700
  success:  bg-success.light text-success.dark
  warning:  bg-warning.light text-warning.dark
  danger:   bg-danger.light text-danger.dark
  info:     bg-info.light text-info.dark

Sizes:
  sm: text-2xs px-1.5 py-0.5 rounded
  md: text-xs  px-2   py-0.5 rounded-full  (default)
  lg: text-sm  px-2.5 py-1   rounded-full

Optional dot prefix: <span class="status-dot bg-{color}" />
```

### 3e · Select (`src/components/Select.tsx`)

Style to match Input exactly. Add a custom chevron-down icon via background-image.

### 3f · Toggle (`src/components/Toggle.tsx`) — New Component

Replace the ad-hoc toggle in ContactsPage:

```
States: on/off, disabled, loading
Sizes:  sm (h-4 w-7), md (h-5 w-9), lg (h-6 w-11)
Colors: on → bg-brand-500, off → bg-surface-300
Knob:   white circle, shadow-sm, transition-transform duration-200
Label:  optional right-side label, text-sm text-surface-700
```

### 3g · Spinner (`src/components/Spinner.tsx`) — New Component

```
CSS animation: border-4 border-surface-200 border-t-brand-500 rounded-full animate-spin
Sizes: xs (12px) sm (16px) md (20px) lg (32px) xl (48px)
Usage: inside Button loading state, page-level loading screens
```

### 3h · EmptyState (`src/components/EmptyState.tsx`) — New Component

```
Structure:
  Centered block inside Card
  Icon (48px, text-surface-300)
  Title (text-surface-700 font-medium)
  Description (text-sm text-surface-400)
  Optional CTA Button

Use for: empty lists, no campaigns yet, no contacts, etc.
```

### 3i · PageHeader (`src/components/PageHeader.tsx`) — New Component

```
Structure (used at top of every page):
  <div class="flex items-start justify-between gap-4 mb-8">
    <div>
      <h1 class="text-2xl font-bold text-surface-800 tracking-tight">{title}</h1>
      {description && <p class="mt-1 text-sm text-surface-500">{description}</p>}
    </div>
    {actions && <div class="flex items-center gap-2 flex-shrink-0">{actions}</div>}
  </div>

Eliminates the current inconsistency where every page styles its own h1 differently.
```

### 3j · Alert (`src/components/Alert.tsx`) — New Component

Replace raw `<p className="text-sm text-red-600">` error messages everywhere:

```
Variants: error | warning | success | info
Structure:
  rounded-lg border px-4 py-3 flex items-start gap-3
  Icon (16px, flex-shrink-0)
  Text slot (text-sm)
  Optional dismiss button (absolute right-3)
```

---

## 4 · Layout System Redesign

### 4a · Sidebar Layout (`src/components/AppLayout.tsx`)

**Replace the current horizontal top-nav with a sidebar + top bar layout.**

```
Desktop (lg+):
┌─────────────────────────────────────────────────────────┐
│  SIDEBAR (240px fixed, h-screen sticky)  │  CONTENT     │
│  ┌────────────────────────────────────┐  │              │
│  │ Logo                               │  │  Top bar     │
│  │ ─────────────────────────────────  │  │  (48px)      │
│  │ MAIN                               │  │              │
│  │  Dashboard                         │  │  Page        │
│  │  Contacts                          │  │  content     │
│  │  Segments                          │  │              │
│  │  Campaigns                         │  │              │
│  │ ─────────────────────────────────  │  │              │
│  │ MARKETING                          │  │              │
│  │  Social                            │  │              │
│  │  SMS                               │  │              │
│  │  Landing Pages                     │  │              │
│  │  Workflows                         │  │              │
│  │ ─────────────────────────────────  │  │              │
│  │ INSIGHTS                           │  │              │
│  │  CRM                               │  │              │
│  │  Analytics                         │  │              │
│  │  SEO                               │  │              │
│  │ ─────────────────────────────────  │  │              │
│  │ GROWTH                             │  │              │
│  │  Affiliate                         │  │              │
│  │  Influencers                       │  │              │
│  │ ─────────────────────────────────  │  │              │
│  │ Org name + plan badge              │  │              │
│  │ Log out                            │  │              │
│  └────────────────────────────────────┘  │              │
└─────────────────────────────────────────────────────────┘

Mobile (<lg):
- Sidebar hidden by default
- Top bar has hamburger icon (left) + logo (center) + avatar (right)
- Hamburger opens a slide-in drawer (sidebar content) with overlay backdrop
- Drawer closes on overlay click or nav link click
```

**Sidebar visual design:**
```
Background:   bg-surface-900  (dark sidebar — high contrast, professional)
Logo area:    px-5 py-5, text-white font-bold, logo icon left
Nav groups:
  Group label: text-2xs font-semibold uppercase tracking-widest text-surface-500 px-4 pt-5 pb-1
  Nav item (inactive): flex items-center gap-3 px-4 py-2.5 rounded-lg mx-2 text-sm text-surface-400
                        hover:bg-surface-800 hover:text-white transition-colors duration-150
  Nav item (active):   bg-brand-500/15 text-brand-400 font-medium
                        [left 3px colored border: border-l-2 border-brand-400]
  Icon: 18px Lucide icon, flex-shrink-0
Footer: border-t border-surface-800 p-4
  Org name: text-sm font-medium text-surface-200
  Plan badge: Badge variant=primary
  Log out: ghost button text-surface-500 hover:text-white
```

**Top bar:**
```
Background: bg-white border-b border-surface-200 h-14 px-6
Left:  hamburger button (mobile only, lg:hidden)
Center: breadcrumb or current page title (desktop)
Right: search icon | notifications bell | avatar dropdown
```

### 4b · Content Area

```
Wrapper: flex-1 flex flex-col min-h-screen overflow-auto
Main:    flex-1 p-6 lg:p-8 bg-surface-50

Page max-width: max-w-7xl (wider than current max-w-5xl — better use of space)
```

### 4c · Admin Panel Layout (`frontend/admin-panel`)

Keep the same sidebar structure but use a **distinct visual identity**:

```
Admin sidebar:
  Background: bg-slate-950 (even darker — visually distinct from main app)
  Logo: "LeadBangla" + "Admin Panel" subtitle in text-xs text-slate-500
  Accent: bg-amber-500/15 text-amber-400 (amber instead of indigo for active items)
  
Admin badge: show "ADMIN" pill in amber in the top bar
```

---

## 5 · Page-by-Page Design Specs

### 5a · Marketing Landing Page (`/`)

**Hero Section:**
```
Background: white with a soft radial gradient blob (brand-100 / violet-100)
  absolute positioned blobs: w-96 h-96 rounded-full blur-3xl opacity-30

Hero content (max-w-3xl mx-auto text-center pt-24 pb-16 px-4):
  Eyebrow: Badge "Built for Bangladesh 🇧🇩" variant=primary (pill)
  H1: text-5xl font-bold text-surface-900 leading-tight
  Sub: text-xl text-surface-500 mt-4 max-w-2xl mx-auto
  CTAs: "Get started free" (primary lg) + "See pricing" (ghost lg)
  Social proof: "Trusted by 500+ businesses" + 5 avatar circles
```

**Features Grid:**
```
Background: surface-50
Grid: 4 columns on desktop (grid-cols-1 sm:grid-cols-2 lg:grid-cols-4)
Each card: Card variant=default hoverable=true
  Icon: 40px icon container bg-brand-100 rounded-xl p-2.5 text-brand-600
  Title: text-lg font-semibold text-surface-800 mt-4
  Body: text-sm text-surface-500 mt-2
```

**Pricing Section:**
```
Background: white
Header: text-3xl font-bold centered + subtitle
Plans grid: grid-cols-1 sm:grid-cols-3 gap-6
Each plan card: Card variant=default
  Popular plan: Card variant=bordered + "Most Popular" badge pinned top-right
  Price: text-4xl font-bold text-surface-900 + /month text-surface-400 text-base
  Feature list: checkmark icons (text-success.base) + feature text-sm text-surface-600
  CTA Button: full width, primary for popular / secondary for others
```

**Nav Bar:**
```
Sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-surface-200
Logo left | nav links center | CTA right
Mobile: logo + hamburger (sheet nav overlay)
```

**Footer:**
```
bg-surface-900 text-surface-400
3-column grid: product links | company | social icons
Bottom bar: © 2026 LeadBangla · BDT pricing · BTRC compliant
```

### 5b · Auth Pages — Login & Signup

**Layout:** Keep the `SplitAuthLayout` split approach (it's already good).

**Left panel redesign:**
```
Background: gradient-to-br from-brand-600 via-violet-600 to-fuchsia-500
Add animated floating shapes (CSS keyframe, slow rotate/scale)
  3-4 blurred circles (bg-white/10 blur-3xl)
Quote block: large italic quote from a Bangladeshi marketer in text-white/80
Logo: text-2xl font-bold text-white
Tagline: text-brand-200 text-sm
```

**Right panel redesign:**
```
Background: bg-white (not bg-gray-50 — cleaner)
Center card: w-full max-w-sm mx-auto
Logo: show only on mobile (brand colored)
Heading: text-2xl font-bold text-surface-900
Subtext: text-sm text-surface-500
Form: space-y-4 with proper labeled inputs (not placeholder-only)
Social login divider: "— or continue with —" + Google button (if applicable)
Footer link: signup / login cross-link
```

### 5c · Dashboard Page

```
Page Header: "Good morning, {name} 👋" + org name subtitle
           + "Last updated: just now" right-aligned text-xs text-surface-400

Stats Row (4 cards, grid-cols-2 lg:grid-cols-4):
  Each stat card — Card variant=default:
    Icon container: 36px rounded-lg, coloured (blue/green/indigo/purple)
    Label: text-xs font-medium text-surface-500 uppercase tracking-wide
    Value: text-3xl font-bold text-surface-900 mt-1
    Delta: "↑ 12% from last week" — text-xs text-success.dark or text-danger.dark
    Subtle bottom progress bar (thin, coloured by channel)

Activity sections (2-column on desktop, 1-column mobile):
  Left (2/3): Recent campaigns table — Channel | Name | Status | Sent | Rate
  Right (1/3): Quick actions panel
    "New Campaign" primary button
    "Import Contacts" secondary button
    "Create Segment" ghost button
    Plan usage bar: "234 / 1,000 contacts used" + progress bar
```

### 5d · Contacts Page

```
Page Header: "Contacts" + "{n} total" badge + "Import CSV" button (right)

Stats bar (3 pills inline):
  "Total: 234" | "SMS opt-in: 120 ✓" | "WhatsApp: 88 ✓"

Import card: collapse into an "Import" button that opens a modal/drawer
  Modal: drag-drop zone + file input + import button + result message

Table card: Card variant=default p-0 (inset)
  thead: bg-surface-50 text-xs uppercase text-surface-400 tracking-wide
  Row hover: hover:bg-surface-50
  Email: text-brand-600 font-medium (link to contact detail)
  Phone: text-surface-600
  Tags: inline Badge chips, sm size
  SMS / WA toggles: Toggle component (sm size)
  
Mobile table: convert to card stack below md breakpoint
  Each contact: Card with name + email prominent, phone + tags below, toggles right-aligned
```

### 5e · Campaigns Page

```
Page Header: "Email Campaigns" + "New Campaign" button

New Campaign — opens as a right-side panel/drawer (not inline form):
  Drawer: slide in from right, 480px wide, overlay backdrop
  Fields: Campaign name | Segment selector | Subject | HTML body (textarea)
  Footer: "Cancel" ghost + "Create Draft" primary

Campaign list:
  Each campaign — Card variant=default flex row (name + status left, actions right)
  Status badge: Badge component with status colours
  Stats: "2,340 sent · 18% open · 4.2% click" — text-sm text-surface-500
  Action buttons: "Send" primary (draft) | "Simulate" ghost (sent)
  
Empty state: EmptyState component — mail icon + "No campaigns yet" + "Create first" CTA
```

### 5f · Analytics Page

```
Page Header: "Cross-Channel Analytics" + date range picker (right)
Date picker: modern inline date range — "Last 7d | 30d | 90d | Custom"

Summary bar: 4 KPI tiles in a row (bg-white rounded-xl border)
  Each KPI: icon + label + large number + channel-coloured

Channel cards (3-column grid):
  Each card: channel icon + chart (mini bar/line) + stat rows
  Chart: CSS-based progress bars are fine (no external lib needed)

Activity Table:
  Sticky thead
  Channel badge (coloured pill)
  Row striping: even rows bg-surface-50/40
  Pagination: "Showing 1–20 of 87 items" + Prev/Next buttons

Mobile: channel cards stack, table becomes horizontal scroll with pinned first column
```

### 5g · Workflow Builder

```
Canvas area: bg-surface-100 min-h-[500px] rounded-xl border border-surface-200
  Grid dots pattern: radial-gradient dot grid for visual context

Step cards: bg-white rounded-lg shadow-sm border border-surface-200
  Connector lines: border-l-2 border-dashed border-surface-300 ml-6

Step types differentiated by left border colour:
  send_email → border-l-blue-400
  send_sms   → border-l-green-400
  wait       → border-l-amber-400
  add_tag    → border-l-violet-400
  if_then    → border-l-orange-400

Add step button: ghost dashed border button centered between steps
Trigger selector: prominent card at top with lightning bolt icon
```

### 5h · CRM / Contact Detail

```
Two-column layout (2/3 + 1/3):
  Left: Activity timeline + notes
  Right: Contact info card + tags editor + segment membership

Contact card:
  Avatar: initials circle (gradient bg, white text)
  Name: text-xl font-bold
  Email + Phone: with copy-to-clipboard icon on hover

Timeline events: vertical line + dots coloured by event type
  email_sent:   blue dot
  sms_sent:     green dot
  form_submit:  violet dot
  tag_added:    amber dot
```

### 5i · SEO Page

```
URL Audit table: Card inset table
  URL | Title | H1 | Status code | Last crawled
  Status badges: 200 → success | 301 → warning | 404 → danger | 500 → danger

Keyword tracker: Card with keyword rows, ranking number prominently displayed
  Trend arrow: ↑ text-success.base | ↓ text-danger.base | — text-surface-400
```

### 5j · Social Page

```
Post composer: Card with platform toggle pills (Facebook | Instagram | LinkedIn)
  Active platform: bg-brand-500 text-white | Inactive: ghost style
  Textarea: min-h-32 with character counter bottom-right
  Media upload: dashed border drop zone
  Schedule picker: datetime-local input

Post list: card grid (2-col on desktop)
  Status badge prominent (scheduled | published | failed)
  Platform icon (16px colored icon)
  Engagement numbers: 👍 {likes} · 🔁 {shares} · 💬 {comments}
```

### 5k · SMS Page

```
Campaign form: same drawer pattern as email campaigns
  Sender ID field + message textarea + character counter
  Segment picker

SMS list: same card-row pattern as campaigns
  Delivery rate progress bar (green) shown inline
```

### 5l · Landing Pages

```
Page list: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
  Each page card: Card hoverable
    Status badge (draft / published)
    Preview thumbnail area: bg-surface-100 rounded-lg min-h-32 (placeholder)
    URL: text-xs text-surface-500 font-mono truncate
    Actions: "Edit" | "View" | "..." menu

Builder canvas: split view
  Left (1/3): Component palette + properties panel
  Right (2/3): Live preview iframe or rendered preview
```

### 5m · Affiliate & Influencer Pages

```
Affiliate:
  Stats row: Commission earned | Pending | Total referrals | Conversion rate
  Affiliates table: Name | Code | Sales | Commission | Status

Influencer:
  Card grid (2-col): Influencer card with avatar + platform icons + stats
  Status badge: active | negotiating | completed
```

---

## 6 · Mobile Responsiveness Rules

### Breakpoint Strategy

```
sm:   640px  — single column → two column transitions
md:   768px  — show more table columns, expand form layouts
lg:  1024px  — sidebar appears, desktop layout activates
xl:  1280px  — wider content, more breathing room
2xl: 1536px  — max-w-7xl becomes comfortable
```

### Mobile Navigation

```
1. Hamburger button: top-left of top bar (lg:hidden)
2. Drawer: fixed inset-0 z-50 flex
   Overlay: absolute inset-0 bg-surface-900/50 (click to close)
   Panel: relative w-64 bg-surface-900 h-full overflow-y-auto shadow-xl
          animate: slide-in-from-left duration-300 (CSS transform)
3. Nav links: same structure as desktop sidebar
4. Close: tap overlay OR tap a nav link
```

### Mobile Table Strategy

```
For tables with > 4 columns (Contacts, Campaigns, Activity):
  Below md breakpoint: convert to stacked card list
    - Primary field (email/name) → large text, full width
    - Secondary fields → smaller, below
    - Actions → bottom-right of card
    - Toggle controls → right-aligned in card footer

For tables with ≤ 4 columns (Affiliates, Keywords):
  Allow horizontal scroll: overflow-x-auto on the Card wrapper
  Sticky first column: position: sticky; left: 0; bg-white; z-10
```

### Touch Targets

```
All interactive elements: min-height 44px min-width 44px
Nav items: py-3 (48px height)
Table row actions: use icon buttons 36px in a flex row
Toggles: use lg size on mobile (h-6 w-11) for easier tapping
```

### Form Layout

```
Desktop: side-by-side fields (grid-cols-2 for name/surname etc.)
Mobile: always single column (grid-cols-1)
Submit buttons: w-full on mobile, auto width on desktop
```

---

## 7 · Animation & Micro-Interactions

### Core Transitions

```css
/* All interactive elements — add to tailwind config */
transitionProperty: 'all'
transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
transitionDuration: '150ms'

/* Card hover lift */
.card-hoverable:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card-hover);
}

/* Sidebar drawer */
.drawer-enter { transform: translateX(-100%); }
.drawer-enter-active { transform: translateX(0); transition: transform 250ms ease-out; }
.drawer-exit-active { transform: translateX(-100%); transition: transform 200ms ease-in; }
```

### Loading States

```
Page-level loading: centered Spinner (lg, brand colour) with fade-in after 200ms
  (avoids flash of spinner for fast loads)

Skeleton screens (use for initial data load):
  .skeleton: bg-surface-200 rounded animate-pulse
  Dashboard stats: 4 skeleton cards same dimensions as real stats
  Table rows: 5 skeleton rows with shimmer

Button loading: replace text with Spinner (xs/sm) + keep button dimensions
  disabled + opacity-75 while loading
```

### Toast Notifications

```
Position: fixed bottom-4 right-4 z-50 flex flex-col gap-2
Toast card: bg-white border border-surface-200 rounded-xl shadow-lg px-4 py-3
  flex items-start gap-3
  Icon (16px, coloured by variant)
  Message text-sm text-surface-700
  Auto-dismiss after 4s with slide-out animation
  Manual dismiss X button
Variants: success | error | warning | info
```

---

## 8 · Icon System

### Library

Use **Lucide React** (`lucide-react` — already a common Tailwind project dependency).

```
Install: npm install lucide-react
Import:  import { LayoutDashboard, Users, Mail } from 'lucide-react'
```

### Nav Icon Map

```
Dashboard     → LayoutDashboard
Contacts      → Users
Segments      → Filter
Campaigns     → Mail
Social        → Share2
SMS           → MessageSquare
Landing Pages → Globe
Workflows     → Workflow
CRM           → BookUser
Analytics     → BarChart3
SEO           → Search
Affiliate     → Link2
Influencers   → Star
```

### Usage Rules

```
Nav icons:     18px (size={18}) — flex-shrink-0
Card icons:    20px inside 40px bg container
Action icons:  16px inside buttons
Status icons:  16px inline with text
Page header:   24px optional decorative
Empty state:   48px text-surface-300
```

---

## 9 · Admin Panel Specific Design

### Visual Distinction

The admin panel must look noticeably different from the main app to prevent confusion.

```
Sidebar: bg-slate-950 (near black, not indigo-dark)
Active item: bg-amber-500/10 text-amber-400 border-l-amber-400
Logo: "LeadBangla" with "Admin" superscript badge in amber
Top bar: bg-slate-900 border-b border-slate-800 text-slate-300

Admin badge: fixed "ADMIN" chip in top bar
  bg-amber-400/10 text-amber-400 border border-amber-400/30
  text-xs font-bold tracking-widest px-2 py-0.5 rounded
```

### Admin Pages

**Tenant List (`/tenants`):**
```
Table: Name | Plan | Status | Contact count | Created | Actions
Row: hover:bg-slate-900/30
Plan badge: coloured by tier (free=surface, starter=blue, pro=violet, enterprise=amber)
Status badge: active=success | inactive=surface | suspended=danger
Actions: "View" button + "Impersonate" secondary button
```

**Tenant Detail (`/tenants/:id`):**
```
Two-column layout:
  Left: Org info card + subscription details
  Right: Usage stats (contacts, campaigns sent, emails sent)
Impersonate button: danger variant (irreversible, admin action — prompt confirmation)
```

---

## 10 · Implementation Order

Implement in this sequence to avoid regressions:

1. **Tailwind config** — add all tokens (Step 2)
2. **Global CSS** (`index.css`) — fonts, base layer, scrollbar
3. **Core components** — Button, Input, Card, Badge, Toggle, Spinner, Alert, EmptyState, PageHeader
4. **AppLayout** — sidebar + top bar + mobile drawer
5. **Auth pages** — Login, Signup (SplitAuthLayout update)
6. **Dashboard** — new stat cards + activity table
7. **Contacts & Segments** — table + mobile card fallback
8. **Campaigns** — drawer form + campaign cards
9. **Analytics** — date range + KPI bar + channel cards + table
10. **Remaining pages** — Social, SMS, Landing Pages, Workflows, CRM, SEO, Affiliate, Influencers
11. **Marketing Landing Page** — full redesign
12. **Admin Panel** — dark sidebar + amber accent + tenant pages
13. **Mobile pass** — test all pages at 375px, 768px, 1024px
14. **Polish** — animations, skeletons, toasts, empty states

---

## 11 · Acceptance Checklist

Before marking the redesign complete, verify:

- [ ] All nav links appear in sidebar (no horizontal top nav)
- [ ] Mobile: hamburger → drawer works and closes on nav click
- [ ] All pages pass at 375px width (no horizontal scroll on content)
- [ ] All tables have mobile fallback (card stack or h-scroll with sticky col)
- [ ] All touch targets ≥ 44px
- [ ] No raw hex colours or non-token Tailwind classes remain (use semantic tokens)
- [ ] Loading states exist for every async operation
- [ ] Empty states exist for every empty list
- [ ] Error states use the Alert component (no raw `<p className="text-red-600">`)
- [ ] Admin panel is visually distinct from main app at a glance
- [ ] Lighthouse mobile score ≥ 85
- [ ] No `console.error` in browser for any page in demo mode

---

## 12 · File Structure After Redesign

```
frontend/main-app/src/
├── components/
│   ├── AppLayout.tsx          # sidebar + top bar + mobile drawer
│   ├── SplitAuthLayout.tsx    # auth split layout (update)
│   ├── Button.tsx             # size + icon + loading
│   ├── Card.tsx               # variant + hoverable
│   ├── Input.tsx              # label + error + icon slots
│   ├── Select.tsx             # styled to match Input
│   ├── Badge.tsx              # NEW — status semantic colours
│   ├── Toggle.tsx             # NEW — replaces ad-hoc toggle
│   ├── Spinner.tsx            # NEW — used in Button + pages
│   ├── Alert.tsx              # NEW — replaces raw error <p>
│   ├── EmptyState.tsx         # NEW — used in all list pages
│   ├── PageHeader.tsx         # NEW — consistent h1 + actions
│   └── Toast.tsx              # NEW — global notification system
├── modules/
│   └── ... (unchanged structure, page files updated)
└── index.css                  # extended with design tokens

frontend/admin-panel/src/
├── components/
│   ├── AppLayout.tsx          # dark amber admin sidebar
│   ├── Button.tsx             # shared (or symlink to main-app)
│   └── Card.tsx               # shared
└── index.css                  # same base, admin accent override
```
