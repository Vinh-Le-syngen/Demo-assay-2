// Singapore policy — GST 9%, UEN/GST-no, SG numbering, on_supply (tax invoice ≤30 days from time of
// supply), PEPPOL e-invoice (transport adapter added separately).
import type { JurisdictionTaxConfig, NumberingConfig } from '../core/config'
import { createJurisdictionPolicy, type JurisdictionPolicySpec } from './factory'

export const SG_TAX: JurisdictionTaxConfig = {
  label: 'GST',
  rates: { standard: 9 },
  categoryTreatment: { qarar_service_fee: 'standard', government_fee: 'out_of_scope', partner_fee: 'standard', discount: 'standard' },
  rounding: 'per_line', // SG permits per-line or per-document if applied consistently
}
export const SG_NUMBERING: NumberingConfig = { invoicePrefix: 'SG', creditNotePrefix: 'SG-CN', annualReset: true, pad: 6 }

export const SG_SPEC: JurisdictionPolicySpec = {
  jurisdiction: 'SG',
  billingMode: 'on_supply',
  creditNoteStyle: 'referencing',
  currency: 'SGD',
  tax: SG_TAX,
  numbering: SG_NUMBERING,
  taxId: { kind: 'gst', label: 'GST Reg. No.' },
}

export const createSgPolicy = () => createJurisdictionPolicy(SG_SPEC)
