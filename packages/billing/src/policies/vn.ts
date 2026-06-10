// Vietnam policy — VAT 10% (reduced 8 / 5 / 0 available), MST (mã số thuế), VN numbering (VND is
// zero-decimal), on_supply, VN e-invoice (transport separate).
import type { JurisdictionTaxConfig, NumberingConfig } from '../core/config'
import { createJurisdictionPolicy, type JurisdictionPolicySpec } from './factory'

export const VN_TAX: JurisdictionTaxConfig = {
  label: 'VAT',
  rates: { standard: 10, reduced: 8 }, // 5 / 0 also exist; mapped per-service later
  categoryTreatment: { qarar_service_fee: 'standard', government_fee: 'out_of_scope', partner_fee: 'standard', discount: 'standard' },
  rounding: 'per_line',
}
export const VN_NUMBERING: NumberingConfig = { invoicePrefix: 'VN', creditNotePrefix: 'VN-CN', annualReset: true, pad: 6 }

export const VN_SPEC: JurisdictionPolicySpec = {
  jurisdiction: 'VN',
  billingMode: 'on_supply',
  creditNoteStyle: 'referencing',
  currency: 'VND', // zero-decimal — formatMoney handles it
  tax: VN_TAX,
  numbering: VN_NUMBERING,
  taxId: { kind: 'mst', label: 'MST' },
  titles: { invoice: 'HÓA ĐƠN GTGT', creditNote: 'HÓA ĐƠN ĐIỀU CHỈNH' },
}

export const createVnPolicy = () => createJurisdictionPolicy(VN_SPEC)
