# CLAUDE.md

## Build & Test
- `npm run dev` — start dev server on port 3000
- `npm test` — run all tests with Jest
- `npm run lint` — ESLint + Prettier check

## Code Style
- TypeScript strict mode, no `any`
- Functional components with hooks
- Use `cn()` for conditional classnames
- Imports: external libs first, then `@/` aliases

## Architecture
- `/src/app` — Next.js app router pages
- `/src/components` — shared UI components
- `/src/lib` — utilities, API clients, types
- `/src/hooks` — custom React hooks

## Database
- Prisma ORM with PostgreSQL
- Run `npx prisma migrate dev` after schema changes
- Seed data: `npx prisma db seed`
