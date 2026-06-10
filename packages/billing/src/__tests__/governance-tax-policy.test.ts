import { describe, it, expect } from 'vitest'
import { createUaePolicy } from '../policies/uae'
import { createSgPolicy } from '../policies/sg'
import { createEsPolicy } from '../policies/es'
import { createVnPolicy } from '../policies/vn'
import type { DraftLine, InvoicePolicy, PolicyContext } from '../core/contract'

// Governance (compliance): the tax POLICY each jurisdiction enforces. These are the rates/treatments
// a tax auditor would check — they are business rules, not incidental behaviour. Asserting them here
// means a config drift (wrong rate, wrong treatment of a government fee) breaks the build, not a customer's
// invoice.

const ctx = { sellerEntity: {} as never, billingAccount: { kind: 'individual' } as never, now: '2026-06-03T00:00:00Z' } as PolicyContext

const service = (currency: string): DraftLine => ({ id: 'svc', category: 'qarar_service_fee', description: 'X', quantity: 1, unitAmount: { amountMinor: 100000, currency } })
const govFee = (currency: string, disbursed: boolean): DraftLine => ({
  id: 'gov', category: 'government_fee', description: 'fee', quantity: 1, unitAmount: { amountMinor: 100000, currency },
  disbursement: disbursed ? { authorizedAsAgent: true, invoiceInCustomerName: true, exactPassThrough: true, separatelyItemized: true } : undefined,
})

type Case = { name: string; policy: InvoicePolicy; currency: string; label: string; standardRate: number }
const CASES: Case[] = [
  { name: 'UAE', policy: createUaePolicy(), currency: 'AED', label: 'VAT', standardRate: 5 },
  { name: 'SG', policy: createSgPolicy(), currency: 'SGD', label: 'GST', standardRate: 9 },
  { name: 'ES', policy: createEsPolicy(), currency: 'EUR', label: 'IVA', standardRate: 21 },
  { name: 'VN', policy: createVnPolicy(), currency: 'VND', label: 'VAT', standardRate: 10 },
]

describe('governance — standard tax rate + label per jurisdiction', () => {
  for (const c of CASES) {
    it(`${c.name}: a service fee is taxed at the ${c.label} standard rate of ${c.standardRate}%`, () => {
      const t = c.policy.classifyLine(ctx, service(c.currency))
      expect(t.category).toBe('standard')
      expect(t.rate.label).toBe(c.label)
      expect(t.rate.ratePct).toBe(c.standardRate)
    })
  }
})

describe('governance — government-fee disbursement rule is uniform across regimes', () => {
  for (const c of CASES) {
    it(`${c.name}: a gov fee WITH full disbursement evidence is out_of_scope (zero-rated, outside tax)`, () => {
      const t = c.policy.classifyLine(ctx, govFee(c.currency, true))
      expect(t.category).toBe('out_of_scope')
      expect(t.rate.ratePct).toBe(0) // outside scope carries no tax
    })
    it(`${c.name}: a gov fee WITHOUT evidence is a taxable reimbursement at the standard rate`, () => {
      const t = c.policy.classifyLine(ctx, govFee(c.currency, false))
      expect(t.category).toBe('standard')
      expect(t.rate.ratePct).toBe(c.standardRate) // policy refuses to treat unproven fees as disbursements
    })
  }
})

describe('governance — credit-note style is the jurisdiction\'s legal model', () => {
  it('ES models a credit as a rectifying (corrective) invoice', () => {
    expect(createEsPolicy().creditNoteStyle).toBe('rectifying')
  })
  it('UAE / SG / VN model a credit as a referencing credit note', () => {
    expect(createUaePolicy().creditNoteStyle).toBe('referencing')
    expect(createSgPolicy().creditNoteStyle).toBe('referencing')
    expect(createVnPolicy().creditNoteStyle).toBe('referencing')
  })
})
