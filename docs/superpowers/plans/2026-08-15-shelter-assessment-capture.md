# Shelter Assessment Capture Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Digitize the two-page Colombian Red Cross temporary-shelter protection, gender, and inclusion assessment and persist authenticated submissions in PostgreSQL.

**Architecture:** Keep Better Auth as the identity boundary. Add Drizzle ORM over the existing PostgreSQL pool, store one assessment record plus normalized item-level answers in a transaction, and expose authenticated Express endpoints. Replace the placeholder member dashboard with a responsive multi-step assessment that mirrors the paper sections and submits a versioned payload.

**Tech Stack:** React 19, TypeScript, Express 5, Better Auth, Drizzle ORM, PostgreSQL, Vitest, Testing Library

---

## Chunk 1: Data model and API

### Task 1: Drizzle foundation and shelter schema

**Files:**
- Create: `drizzle.config.ts`
- Create: `server/db/index.ts`
- Create: `server/db/schema.ts`
- Modify: `server/auth.ts`
- Modify: `package.json`
- Generate: `drizzle/*`

- [ ] Install `drizzle-orm` and `drizzle-kit`.
- [ ] Define `shelter_assessments` with UUID ID, form version, shelter/visit/contact fields, observations, visitors, authenticated creator ID, and timestamps.
- [ ] Define `assessment_responses` with an assessment foreign key, criterion key, tri-state answer, comments, timestamps, a composite uniqueness constraint, and an assessment index.
- [ ] Reuse the existing PostgreSQL pool for Drizzle.
- [ ] Generate and review a versioned migration containing only the two new tables and enum.
- [ ] Add generate, migrate, and studio scripts.

### Task 2: Domain contract and validation

**Files:**
- Test: `shared/assessment.test.ts`
- Create: `shared/assessment.ts`

- [ ] Write failing tests for the canonical section/criterion catalog and submission validation.
- [ ] Verify failures are due to missing domain behavior.
- [ ] Implement the seven paper sections, stable criterion keys, answer types, payload types, normalization, and validation.
- [ ] Require shelter name, visit date, municipality, department, contact name, and every criterion answer.
- [ ] Run focused tests.

### Task 3: Authenticated assessment API

**Files:**
- Test: `server/assessments.test.ts`
- Create: `server/assessments.ts`
- Modify: `server/app.ts`

- [ ] Write failing tests for unauthenticated rejection, invalid input rejection, and successful persistence delegation.
- [ ] Verify the focused test fails before implementation.
- [ ] Add a dependency-injected Express router that resolves the Better Auth session and saves validated submissions.
- [ ] Persist the assessment and answers in one Drizzle transaction.
- [ ] Mount `/api/assessments` after JSON middleware.
- [ ] Run focused and full server tests.

## Chunk 2: Field assessment experience

### Task 4: Multi-step assessment UI

**Files:**
- Test: `src/App.test.tsx`
- Create: `src/components/AssessmentForm.tsx`
- Create: `src/lib/assessment-api.ts`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: `index.html`

- [ ] Add failing component tests proving authenticated users see shelter details, can answer and navigate sections, and receive submission success/error feedback.
- [ ] Preserve existing sign-in, sign-up, session, and sign-out tests.
- [ ] Implement a Red Cross-inspired operational UI with persistent progress, accessible grouped radios, per-item comments, previous/next navigation, review, and submit.
- [ ] Keep mobile tap targets large and the current reduced-motion behavior.
- [ ] Update public copy for the August 10, 2026 Colombia earthquake and shelter-assessment purpose.
- [ ] Run focused and full client tests.

### Task 5: Environment, documentation, and verification

**Files:**
- Create local ignored file: `.env`
- Modify: `.env.example`
- Modify: `README.md`

- [ ] Configure the supplied local PostgreSQL URL without committing secrets.
- [ ] Document schema generation, migration, and assessment workflow.
- [ ] Run formatting, tests, type checks, and production build.
- [ ] Apply migrations if PostgreSQL is reachable; otherwise report the exact database blocker.
- [ ] Start Vite and Express, then verify the page, health endpoint, and unauthenticated API boundary.
