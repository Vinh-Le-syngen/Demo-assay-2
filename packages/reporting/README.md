# @sys/reporting

Declarative **report definitions + pure aggregation + cron schedule matcher + CSV/JSON export**.
The tail of the observability family (`@sys/telemetry` → `@sys/errors` → **`@sys/reporting`**).

Operates on any record stream — telemetry events satisfy the `Row` shape, so reports aggregate them
directly. No runtime dependencies. I/O is injected: a `DataSource` pulls rows, a `Delivery` sends output.
The engine emits/decides nothing on its own.

## API

```ts
import { defineReport, aggregate, runReport, toCSV, toJSON, isDue } from '@sys/reporting'

const def = defineReport({
  id: 'errors-by-plane', name: 'Errors by plane', source: 'telemetry',
  window: { field: 'ts', from, to },
  filters: [{ field: 'domain', op: 'eq', value: 'error' }],
  groupBy: ['data.plane'],
  metrics: [
    { name: 'count', op: 'count' },
    { name: 'retryable', op: 'countWhere', where: { field: 'data.retryable', op: 'eq', value: true } },
  ],
  orderBy: { metric: 'count', dir: 'desc' },
  limit: 10,
})

const result = aggregate(def, rows, generatedAtIso)        // pure
const result2 = await runReport(def, dataSource, { delivery, format: 'csv', now })  // orchestrated
```

- **Filters**: `eq ne in gt gte lt lte contains exists` over dot-paths.
- **Metrics**: `count sum avg min max distinct countWhere`. Empty buckets yield `0`, never `NaN`.
- **Schedule**: `isDue(cron, date)` — standard 5-field cron (`* a,b a-b *​/n`), evaluated in UTC, dow 0=Sunday.
- **Export**: `toCSV` (dimension columns then metric columns, RFC-escaped) / `toJSON`.

`aggregate` takes the `generatedAt` stamp as an argument so it stays pure and deterministic — the host
supplies the clock.

## Build

`pnpm build` (tsup, ESM+CJS+dts) · `pnpm test` (vitest) · `pnpm typecheck`.
