// @sys/reporting types — declarative report defs over a generic record stream (Observability plane).
// Input rows are plain records; telemetry events satisfy this shape, so reports aggregate them directly.

/** A row of source data. Dot-path field access is supported against nested records. */
export type Row = Record<string, unknown>

export type FilterOp =
  | 'eq' | 'ne' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists'

export interface Filter {
  /** Dot-path, e.g. 'data.amount' or 'severity'. */
  field: string
  op: FilterOp
  /** Compared value; ignored for 'exists'. For 'in' supply an array. */
  value?: unknown
}

export type AggOp = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'distinct' | 'countWhere'

export interface Metric {
  /** Output column name. */
  name: string
  op: AggOp
  /** Dot-path of the field to aggregate (sum/avg/min/max/distinct). */
  field?: string
  /** Sub-filter for 'countWhere'. */
  where?: Filter
}

export interface ReportDefinition {
  id: string
  name: string
  /** Logical source name, resolved by the injected DataSource. */
  source: string
  /** Pre-aggregation row filters (AND-combined). */
  filters?: Filter[]
  /** Restrict to a time window on a timestamp field (ISO strings). */
  window?: { field: string; from?: string; to?: string }
  /** Grouping dimensions (dot-paths). Empty ⇒ a single total row. */
  groupBy?: string[]
  metrics: Metric[]
  /** Sort result rows by a metric. */
  orderBy?: { metric: string; dir?: 'asc' | 'desc' }
  /** Cap the number of result rows (applied after ordering). */
  limit?: number
}

export interface ReportRow {
  dimensions: Record<string, unknown>
  metrics: Record<string, number>
}

export interface ReportResult {
  reportId: string
  generatedAt: string
  rowCount: number
  rows: ReportRow[]
}

export type ExportFormat = 'csv' | 'json'

/** Injected adapter: pull the rows for a report. The engine never touches I/O itself. */
export interface DataSource {
  fetch(source: string, def: ReportDefinition): Promise<Row[]> | Row[]
}

/** Injected adapter: deliver a rendered report somewhere (email, storage, webhook…). */
export interface Delivery {
  deliver(reportId: string, payload: string, format: ExportFormat): Promise<void> | void
}
