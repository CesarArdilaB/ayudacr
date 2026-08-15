# Respuesta Colombia

A responsive field application for capturing protection, gender, and inclusion assessments in
temporary shelters after the August 10, 2026 Colombia earthquake. The workflow digitizes the
two-page shelter form into six guided sections and 44 criteria, with a final review before saving.

Authentication is powered by [Better Auth](https://better-auth.com/). Assessment data is managed
with [Drizzle ORM](https://orm.drizzle.team/) in PostgreSQL. The browser talks to an Express API
through Vite's development proxy, keeping database credentials and auth secrets server-only.

## Stack

- React 19 + Vite 8 + TypeScript
- Better Auth with email and password authentication
- PostgreSQL with Drizzle ORM and generated SQL migrations
- Express 5 API server
- Vitest + Testing Library
- Biome formatting and linting

## Local setup

Requirements: Node.js 20.19 or newer and PostgreSQL.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create the local environment file:

   ```bash
   cp .env.example .env
   ```

3. Set `DATABASE_URL` to the PostgreSQL connection string. Generate a strong Better Auth secret and place
   it in `BETTER_AUTH_SECRET`:

   ```bash
   openssl rand -base64 32
   ```

4. Apply the database migrations. These create both the Better Auth tables and the shelter
   assessment tables:

   ```bash
   npm run db:migrate
   ```

5. Start the Vite client and Express API together:

   ```bash
   npm run dev
   ```

Open [http://localhost:5173](http://localhost:5173). The API listens on port `3005`, and Vite proxies
all `/api` requests to it.

## Commands

```bash
npm run dev           # start the client and API in watch mode
npm test              # run the test suite once
npm run test:watch    # run tests interactively
npm run typecheck     # check client and server TypeScript
npm run format        # format and lint with Biome
npm run lint          # check formatting, lint rules, and types
npm run build         # type-check and build the production client
npm run verify        # run every release check
npm run db:generate   # generate SQL after a Drizzle schema change
npm run db:migrate    # apply pending Drizzle migrations
npm run db:studio     # inspect data with Drizzle Studio
npm start             # serve the API (and dist/ when NODE_ENV=production)
```

## Deploy to Vercel

The repository includes `vercel.json` and `api/index.ts`. Vercel builds the Vite SPA into `dist/`,
routes `/api/*` to the Express function, and sends other paths to the SPA entrypoint.

1. Provision hosted PostgreSQL through Neon, Vercel Marketplace, or another public provider. A
   `127.0.0.1` URL cannot work from Vercel.
2. Add these Vercel project environment variables for Production and Preview:

   - `DATABASE_URL`: pooled hosted PostgreSQL connection string with TLS enabled.
   - `BETTER_AUTH_SECRET`: random value of at least 32 characters.
   - `BETTER_AUTH_URL`: optional stable production origin, such as
     `https://respuesta-colombia.vercel.app`. When omitted, Vercel's system hostname is used.
   - `CLIENT_URL`: optional comma-separated custom origins. Vercel preview and production hosts
     are trusted automatically.

3. Apply migrations to the hosted database before sending traffic:

   ```bash
   DATABASE_URL='postgresql://...' npm run db:migrate
   ```

4. Import the GitHub repository in Vercel or run `vercel --prod` from an authenticated CLI.
5. Treat `GET /api/health` as the readiness gate. It returns HTTP 200 only when PostgreSQL is
   reachable; otherwise it returns HTTP 503 and auth/capture should not receive traffic.

Never expose `DATABASE_URL` or `BETTER_AUTH_SECRET` through a `VITE_` environment variable. Run
`npm run verify` before every production release.
