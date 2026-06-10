// Per-jurisdiction config the policies consume. Nothing tax-specific is global.
import type { LineCategory, TaxCategory } from './contract'

export interface NumberingConfig {
  invoicePrefix: string // 'AE'
  creditNotePrefix: string // 'AE-CN'
  annualReset: boolean
  pad: number
}
export interface JurisdictionTaxConfig {
  label: string // 'VAT' | 'GST' | 'IVA'
  rates: Record<string, number> // { standard: 5 } | { standard: 21, reduced: 10 }
  categoryTreatment: Record<LineCategory, TaxCategory> // default category per line category
  serviceTax?: Record<string, { govFeeTreatment: 'disbursement' | 'resale' }>
  rounding: 'per_line' | 'per_document'
}
