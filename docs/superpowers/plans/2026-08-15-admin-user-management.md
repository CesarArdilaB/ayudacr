# Admin User Management Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give super administrators a protected interface to create and list users, reset passwords, and promote evaluators while public registration remains disabled.

**Architecture:** Extend the existing `/api/admin` router with an injected user service backed by Drizzle, Better Auth's server-side signup flow, and Better Auth-compatible password hashing. Add a focused React `AdminUsers` surface and typed client functions, exposed only through the existing super-admin navigation.

**Tech Stack:** React 19, TypeScript, Express, Better Auth, Drizzle ORM, PostgreSQL, Vitest, Testing Library.

---

### Task 1: Protected admin user API

**Files:**
- Modify: `server/admin.ts`
- Modify: `server/admin.test.ts`

- [ ] Write failing tests for super-admin list/create/password/promote endpoints and evaluator denial.
- [ ] Run `npm test -- server/admin.test.ts` and confirm expected failures.
- [ ] Implement validation and the injected admin user service.
- [ ] Persist roles with Drizzle and passwords with Better Auth-compatible hashing.
- [ ] Run `npm test -- server/admin.test.ts` and confirm all tests pass.

### Task 2: Typed admin client

**Files:**
- Modify: `src/lib/admin-api.ts`
- Create: `src/lib/admin-api.test.ts`

- [ ] Write failing request-contract tests for list, create, password update, and promotion.
- [ ] Implement the typed API functions with credential cookies and useful errors.
- [ ] Run `npm test -- src/lib/admin-api.test.ts` and confirm all tests pass.

### Task 3: Super-admin users interface

**Files:**
- Create: `src/components/AdminUsers.tsx`
- Create: `src/components/AdminUsers.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

- [ ] Write failing tests for visibility, creation, listing, password updates, and promotion.
- [ ] Add the Users navigation item only for super admins.
- [ ] Implement responsive forms and table/card layouts, refreshing state after mutations.
- [ ] Run the focused component and app tests until green.

### Task 4: Journey and production verification

**Files:**
- Modify if required: `server/journey.integration.test.ts`

- [ ] Confirm public signup still returns `EMAIL_PASSWORD_SIGN_UP_DISABLED`.
- [ ] Run `npm run verify` for formatting, types, all tests, and production build.
- [ ] Push to `main`, wait for Vercel `Ready`, and smoke-test login plus protected admin endpoints.
