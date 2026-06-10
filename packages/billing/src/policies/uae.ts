// UAE policy — VAT 5%, government fees disbursement-by-evidence, B2B TRN, AE numbering, paid_only.
import type { JurisdictionTaxConfig, NumberingConfig } from '../core/config'
import { createJurisdictionPolicy, type JurisdictionPolicySpec } from './factory'

export const UAE_TAX: JurisdictionTaxConfig = {
  label: 'VAT',
  rates: { standard: 5 },
  categoryTreatment: { qarar_service_fee: 'standard', government_fee: 'out_of_scope', partner_fee: 'standard', discount: 'standard' },
  rounding: 'per_line',
}
export const UAE_NUMBERING: NumberingConfig = { invoicePrefix: 'AE', creditNotePrefix: 'AE-CN', annualReset: true, pad: 6 }

export const UAE_SPEC: JurisdictionPolicySpec = {
  jurisdiction: 'AE',
  billingMode: 'paid_only', // payment is the VAT tax point for Qarar's advance-pay model
  creditNoteStyle: 'referencing',
  currency: 'AED',
  tax: UAE_TAX,
  numbering: UAE_NUMBERING,
  taxId: { kind: 'trn', label: 'TRN' },
}

export const createUaePolicy = () => createJurisdictionPolicy(UAE_SPEC)
