# Vite Better Auth Neon SPA Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished React/Vite single-page application with email/password authentication backed by Better Auth and Neon PostgreSQL.

**Architecture:** Vite serves the React client and proxies same-origin `/api` calls to a small Express server in development. The server owns the Better Auth instance, PostgreSQL connection pool, secrets, and auth routes; the browser uses Better Auth's React client and never receives database credentials.

**Tech Stack:** React 19, Vite, TypeScript, Better Auth, Express, PostgreSQL (`pg` with a Neon connection string), Vitest, Testing Library, Biome

---

## Chunk 1: Foundation and server

### Task 1: Project foundation

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `biome.json`
- Create: `index.html`

- [ ] Add scripts for the client, server, combined development, tests, type checking, formatting, and production build.
- [ ] Install runtime and development dependencies.
- [ ] Confirm Vitest starts successfully before application tests exist.

### Task 2: Server configuration and auth API

**Files:**
- Test: `server/config.test.ts`
- Create: `server/config.ts`
- Create: `server/auth.ts`
- Create: `server/app.ts`
- Create: `server/index.ts`

- [ ] Write failing tests for required server environment variables and origin parsing.
- [ ] Run the focused test and confirm it fails because the config module is absent.
- [ ] Implement environment parsing with actionable errors.
- [ ] Configure a PostgreSQL pool and Better Auth email/password authentication.
- [ ] Mount the Better Auth handler before JSON middleware and expose a health endpoint.
- [ ] Run the focused tests and type check.

## Chunk 2: Authenticated SPA

### Task 3: Client auth state and form behavior

**Files:**
- Test: `src/lib/auth-form.test.ts`
- Create: `src/lib/auth-form.ts`
- Create: `src/lib/auth-client.ts`

- [ ] Write failing tests for normalized form values and client validation.
- [ ] Confirm the tests fail because the behavior is not implemented.
- [ ] Implement only the validated form transformation required by the tests.
- [ ] Configure Better Auth's React client against the same-origin API.
- [ ] Run the focused tests.

### Task 4: Accessible SPA interface

**Files:**
- Test: `src/App.test.tsx`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src/test/setup.ts`

- [ ] Write failing component tests for signed-out and signed-in states.
- [ ] Confirm failures represent missing UI behavior.
- [ ] Implement sign-in, sign-up, loading, error, protected dashboard, and sign-out states.
- [ ] Apply a distinctive Costa Rican civic-editorial visual direction with responsive and reduced-motion behavior.
- [ ] Run component tests and the complete test suite.

## Chunk 3: Handoff and verification

### Task 5: Setup documentation

**Files:**
- Create: `.env.example`
- Create: `.gitignore`
- Modify: `README.md`

- [ ] Document Neon creation, environment variables, Better Auth migration, development, testing, and production build commands.
- [ ] Ensure secrets and local database artifacts are ignored.

### Task 6: Final verification

**Files:**
- Modify as needed based on verification failures.

- [ ] Run formatting checks.
- [ ] Run all tests.
- [ ] Run TypeScript checks.
- [ ] Run the production build.
- [ ] Start the local services with safe placeholder configuration and verify the health endpoint and initial page load.
- [ ] Review the final diff for accidental secrets or unrelated changes.
