# Development Notes

## Sprint 12 — March 2026

### Completed
- [x] Migrate from Pages Router to App Router
- [x] Add WebSocket support for real-time metrics
- [x] Implement role-based access control
- [ ] Add E2E tests with Playwright
- [ ] Performance audit with Lighthouse

### Architecture Decision: Server Components

We moved data fetching to React Server Components to reduce client bundle size. The metrics page went from 180KB to 42KB JS shipped to client.

```tsx
// app/dashboard/page.tsx — runs on the server
export default async function DashboardPage() {
  const metrics = await getMetrics();
  return <MetricsGrid data={metrics} />;
}
```

### Performance Results

| Metric | Before | After |
|--------|--------|-------|
| First Paint | 1.8s | 0.6s |
| Bundle Size | 180KB | 42KB |
| Lighthouse | 72 | 96 |

---

*Last updated: March 13, 2026*
