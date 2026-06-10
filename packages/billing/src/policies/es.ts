// Spain policy — IVA 21% (reduced 10 / super-reduced 4 available), NIF, ES numbering with a separate
// corrective series, on_supply, rectifying credit notes, Facturae/UBL e-invoice (transport separate).
import type { JurisdictionTaxConfig, NumberingConfig } from '../core/config'
import { createJurisdictionPolicy, type JurisdictionPolicySpec } from './factory'

export const ES_TAX: JurisdictionTaxConfig = {
  label: 'IVA',
  rates: { standard: 21, reduced: 10, super: 4 },
  categoryTreatment: { qarar_service_fee: 'standard', government_fee: 'out_of_scope', partner_fee: 'standard', discount: 'standard' },
  rounding: 'per_line',
}
// ES uses a distinct series for corrective (rectifying) invoices.
export const ES_NUMBERING: NumberingConfig = { invoicePrefix: 'ES', creditNotePrefix: 'ES-RECT', annualReset: true, pad: 6 }

export const ES_SPEC: JurisdictionPolicySpec = {
  jurisdiction: 'ES',
  billingMode: 'on_supply',
  creditNoteStyle: 'rectifying', // ES models a credit as a corrective/rectifying invoice
  currency: 'EUR',
  tax: ES_TAX,
  numbering: ES_NUMBERING,
  taxId: { kind: 'nif', label: 'NIF' },
  titles: { invoice: 'FACTURA', creditNote: 'FACTURA RECTIFICATIVA' },
}

export const createEsPolicy = () => createJurisdictionPolicy(ES_SPEC)
