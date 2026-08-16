# Assessment PDF and CSV Exports Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let super administrators download one complete shelter evaluation as a polished PDF and all evaluations as an analysis-ready CSV.

**Architecture:** Add protected download routes to the existing admin router and extend its Drizzle repository with detailed assessment reads. Generate CSV rows from stable keyset-paginated database batches and stream them directly without selecting photo bytes; generate each bounded single-record PDF in memory. The React records screen fetches bounded PDFs as blobs, but preflights the unbounded CSV and starts a native attachment download in a hidden context so it streams to disk without navigating or buffering the full file in the SPA.

**Tech Stack:** TypeScript, Express, Drizzle ORM/PostgreSQL, React/Vite, pdf-lib, @pdf-lib/fontkit, bundled Unicode font, Vitest, Poppler.

**Implementation status (2026-08-16):** Completed and verified. The task checkboxes below preserve the original TDD execution recipe; commits `6e5d011` through `36b6c9b` implement it. An additive pagination index required migration `0005_tense_may_parker.sql`.

---

## Chunk 1: Export contracts and serializers

### Task 1: Define detailed export data and CSV serialization

**Files:**
- Create: `server/assessment-exports.ts`
- Create: `server/assessment-exports.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install `pdf-lib`, `@pdf-lib/fontkit`, and a traceable packaged Unicode font as production dependencies.**
- [ ] **Step 2: Write failing tests for a UTF-8 BOM CSV with one row per criterion, `formVersion`, Spanish answer labels, repeated evaluation metadata, quantity labels/values, photo count, RFC 4180 quoting, and formula-injection neutralization for values beginning with whitespace plus `=`, `+`, `-`, `@`, tab, CR, or LF. Include missing and unknown response keys.**
- [ ] **Step 3: Run `npm test -- server/assessment-exports.test.ts` and confirm the missing serializer failure.**
- [ ] **Step 4: Implement shared detailed-export types and a row/chunk CSV serializer using a versioned form-definition registry (initial snapshot `2026-08-10`) for canonical labels/order; emit stored unknown keys with a safe fallback label and never silently discard them. Never concatenate the full all-records CSV.**
- [ ] **Step 5: Run the focused tests and confirm they pass.**

### Task 2: Generate one polished PDF per evaluation

**Files:**
- Modify: `server/assessment-exports.ts`
- Modify: `server/assessment-exports.test.ts`

- [ ] **Step 1: Write failing tests that require a valid `%PDF` document, `formVersion`, all evaluation sections, missing/unknown stored responses, multiple pages, embedded JPEG evidence, Spanish accents, names from Colombian Indigenous languages, and valid non-WinAnsi user text without generation failure.**
- [ ] **Step 2: Run the focused test and confirm it fails because PDF generation is missing.**
- [ ] **Step 3: Implement A4 PDF generation with an embedded Unicode font (and explicit unsupported-glyph substitution), Colombia-color header, shelter/contact metadata, visitors, notes, all 44 ordered responses and quantities, photo pages, wrapping, page breaks, and page numbering.**
- [ ] **Step 4: Run tests and confirm serialization and PDF tests pass.**
- [ ] **Step 5: Generate a representative PDF under `tmp/pdfs`, inspect it with `pdfinfo`, render every page with `pdftoppm`, and visually inspect the PNG pages for clipping, overlap, glyph, photo, and page-break defects.**

## Chunk 2: Protected API and database reads

### Task 3: Load complete assessments efficiently

**Files:**
- Modify: `server/admin.ts`
- Modify: `server/admin.test.ts`

- [ ] **Step 1: Extend repository test doubles and write failing route tests for explicit cheap `HEAD /assessments.csv`, `GET /assessments.csv`, and `GET /assessments/:id.pdf`, including content type, attachment filename, empty CSV, 401, 403, malformed UUID, 404, repository/stream failure, and ensuring denied or malformed requests never read data. Prove HEAD returns before any CSV iterator/query begins rather than falling through to Express GET handling.**
- [ ] **Step 2: Run `npm test -- server/admin.test.ts` and confirm route failures.**
- [ ] **Step 3: Extend `AdminAssessmentRepository` with an async CSV batch iterator ordered by the total key `(createdAt DESC, id DESC)`, using a lexicographic cursor and first selecting a bounded batch of assessment IDs before loading their creator/responses/photo counts (never `bytea`); add `findDetailed(id)` for one assessment's bounded responses/photos. Validate IDs as UUIDs before Drizzle access.**
- [ ] **Step 4: Add an explicit protected constant-time CSV HEAD route before its GET route, then both download routes before user-management routes. Stream CSV header and row chunks with backpressure/drain handling and abort cleanup; if generation fails before headers, return JSON 500, and if it fails after headers, log and destroy the partial connection so a corrupt file is not reported as complete. Send the bounded PDF buffer with safe `Content-Disposition` filenames and `Cache-Control: private, no-store`.**
- [ ] **Step 5: Add a stress test whose CSV output exceeds Vercel's 4.5 MB response-body threshold and assert incremental writes/bounded repository batches rather than full-string construction; add equal-timestamp fixtures that prove no assessment is skipped or duplicated.**
- [ ] **Step 6: Run the focused tests and confirm they pass.**

## Chunk 3: Responsive admin controls and journey protection

### Task 4: Add download actions to the records screen

**Files:**
- Modify: `src/components/AdminRecords.tsx`
- Create: `src/components/AdminRecords.test.tsx`
- Modify: `src/lib/admin-api.ts`
- Modify: `src/lib/admin-api.test.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing API/UI tests for a global “Descargar todos en CSV” action and one “Descargar PDF” action per record. For PDF cover credentials, blob filename, URL cleanup, and 401/403/404/500/non-JSON errors. For CSV cover an authenticated `HEAD` preflight, pending/duplicate-click state, empty data, and a subsequent native attachment request targeted at a hidden iframe so the full CSV is never accumulated in browser memory and errors never navigate the SPA.**
- [ ] **Step 2: Run `npm test -- src/components/AdminRecords.test.tsx` and confirm the missing controls fail.**
- [ ] **Step 3: Add a credentialed PDF fetch-to-Blob helper plus CSV `HEAD` preflight/native-download helper, and accessible buttons with descriptive labels, a new actions column, progress/error status, touch targets of at least 44 px, hidden iframe cleanup, and mobile card layout compatibility.**
- [ ] **Step 4: Run the focused component and existing app tests.**

### Task 5: Verify, release, and smoke production

**Files:**
- Modify only if verification exposes a defect.

- [ ] **Step 1: Run `npm run format`, `npm run verify`, and confirm the original sign-in, assessment capture, records loading, user administration, and photo tests remain green.**
- [ ] **Step 2: Confirm `git diff --check`, review the diff for accidental secrets/data, and commit the scoped feature.**
- [ ] **Step 3: Push `main`, wait for the Vercel deployment, and verify the production health endpoint.**
- [ ] **Step 4: At narrow phone and desktop viewports, sign in as a super administrator, create one uniquely named temporary evaluation with a photo, download and validate its PDF and the all-records CSV, observe no browser-console errors, then delete only that exact smoke record and confirm photo cascade cleanup.**
- [ ] **Step 5: Verify an evaluator receives 403 for both export routes and report any residual browser/manual verification gap explicitly.**

## Journey contract

- **User/role:** Authenticated super administrator.
- **Starting point:** “Registros” in the admin navigation.
- **Goal:** Obtain one complete printable evaluation or the complete data set for analysis.
- **Happy path:** Records load; CSV link downloads all detailed rows; each record’s PDF link downloads the matching complete evaluation with photos.
- **Required state:** Valid super-admin session and reachable database.
- **Expected result:** Correct attachment headers, deterministic content, no mutation of stored data.
- **Escape/error states:** 401 unauthenticated, 403 evaluator, 404 unknown assessment, Spanish UI remains usable after a failed download.
- **Impact map:** Existing auth/capture/list/user journeys are preserved; exports are additive. Migration `0005_tense_may_parker.sql` adds only the composite export-pagination index and does not alter stored records.
