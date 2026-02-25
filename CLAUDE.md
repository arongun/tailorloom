# TailorLoom

Revenue Intelligence Console for service-based businesses. Imports customer data from multiple sources (Stripe, Calendly, PassLine, POS, WeTravel), stitches identities across systems, and surfaces revenue analytics with churn/segmentation insights.

## Tech Stack

- **Next.js 15** (App Router, Turbopack) + **React 19** + **TypeScript 5**
- **Tailwind CSS 4** + **shadcn/ui** (new-york style)
- **Supabase** — PostgreSQL database, Auth (email OTP + Google OAuth), RLS
- **Recharts** for data viz, **PapaParse** for CSV parsing
- **next-themes** for dark/light mode
- Deployed on **Vercel**

## Project Structure

```
src/app/(dashboard)/          # Protected pages: dashboard, customers, upload, imports, conflicts
src/app/(auth)/login/         # Login (email OTP, Google OAuth, dev bypass)
src/app/api/auth/             # OAuth callback, dev login endpoint
src/lib/actions/              # Server actions (dashboard.ts, import.ts, history.ts, mappings.ts)
src/lib/supabase/             # Supabase clients (client.ts, server.ts, admin.ts)
src/lib/csv/                  # CSV parsing, source detection, column mapping, validation
src/lib/stitching/            # Customer identity matching logic
src/lib/types/                # TypeScript types (database.ts, csv.ts)
src/components/               # App components (sidebar, dashboard-client, customers-client, etc.)
src/components/ui/            # shadcn/ui primitives
supabase/migrations/          # SQL migrations
```

## Key Patterns

- **Server actions** for all data access — authenticate via `createClient()`, check user, query Supabase
- **CSV import flow**: Upload → auto-detect source → map columns → stitch preview → user confirms matches → import
- **Identity stitching**: Confident matches (ID/email) auto-merge; uncertain matches (name-only) flagged for review
- **Middleware** (`src/middleware.ts`): guards all routes except `/login`, `/api/auth`, and static assets
- Path alias: `@/*` → `./src/*`

## Build & Dev

- `npm run dev` — local dev server (Turbopack)
- `npx tsc --noEmit` — type check
- `npx next build` — production build

## Dark / Light Mode — CRITICAL

Every UI change **must** work in both themes. Uses `next-themes` + semantic CSS variables.

- `src/components/theme-provider.tsx` — wraps app with `attribute="class"`, `disableTransitionOnChange`
- `src/app/globals.css` — defines tokens in `:root` (light) and `.dark` (dark), registered in `@theme inline`

### Semantic token classes (use INSTEAD of hardcoded colors)

| Instead of | Use |
|---|---|
| `bg-white` | `bg-surface` |
| `bg-slate-50` | `bg-surface-elevated` |
| `bg-slate-100` | `bg-surface-muted` |
| `bg-slate-900` (active/CTA) | `bg-surface-active` |
| `text-slate-900` / `text-slate-800` | `text-text-primary` |
| `text-slate-700` / `text-slate-600` | `text-text-secondary` |
| `text-slate-500` / `text-slate-400` / `text-slate-300` | `text-text-muted` |
| `text-white` (on dark bg) | `text-text-on-active` |
| `border-slate-200` | `border-border-default` |
| `border-slate-100` | `border-border-muted` |

### Theme rules
- **NEVER** use hardcoded `bg-white`, `bg-slate-*`, `text-slate-*`, or `border-slate-*`. Always use semantic tokens.
- Status colors (`emerald-*`, `amber-*`, `rose-*`) and source badge colors (`violet-*`, `blue-*`, `cyan-*`, `orange-*`) are fine as-is.
- For images/logos: use theme-aware `src` swapping via `resolvedTheme` (see `sidebar.tsx`). Never use `dark:invert`.
- Logo files: `tailorloom-logo.png` (light), `tailorloom-logo-dark.png` (dark), `tailorloom-icon.png` (transparent, both).
- Verify new components look correct in both modes.

## Supabase

- Project ref: `fqszepiacfcctehpkjse`
- Key tables: `customers`, `customer_sources`, `payments`, `bookings`, `attendance`, `import_history`, `stitching_conflicts`, `insight_config`, `saved_mappings`
- Source types: `stripe`, `calendly`, `passline`, `pos`, `wetravel`, `manual`
- Default org ID: `00000000-0000-0000-0000-000000000001`
