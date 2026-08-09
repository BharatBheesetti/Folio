# Acme Dashboard

A modern analytics dashboard built with Next.js 14, TypeScript, and Tailwind CSS.

## Features

- **Real-time metrics** — WebSocket-powered live data updates
- **Dark mode** — system-aware with manual toggle
- **Role-based access** — admin, editor, viewer roles via NextAuth
- **Export to PDF** — generate reports with one click

## Quick Start

```bash
git clone https://github.com/acme/dashboard.git
cd dashboard
npm install
cp .env.example .env.local
npm run dev
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | PostgreSQL + Prisma |
| Auth | NextAuth.js |
| Charts | Recharts |

## API Routes

```typescript
// GET /api/metrics — fetch dashboard metrics
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get('range') ?? '7d';

  const metrics = await db.metric.findMany({
    where: { createdAt: { gte: getStartDate(range) } },
    orderBy: { createdAt: 'desc' },
  });

  return Response.json({ metrics, count: metrics.length });
}
```

> **Note**: Set `DATABASE_URL` in `.env.local` before running.

## License

MIT
