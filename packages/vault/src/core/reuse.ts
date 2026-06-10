// Reuse: given the account's documents + the types a new service requires, work out which are
// already in the vault (reusable) vs missing. A document is reusable only if it's active AND not
// past its expiry (an expired passport must NOT count as reusable). Pure.

import type { VaultDocument } from './contract'

export interface ReuseResult { reusable: VaultDocument[]; missing: string[] }

export function isReusable(doc: VaultDocument, now: string): boolean {
  if (doc.status !== 'active') return false
  if (doc.metadata.expiryDate && doc.metadata.expiryDate <= now) return false
  return true
}

export function reusableFor(docs: VaultDocument[], requiredTypes: string[], now: string): ReuseResult {
  // Index the newest reusable doc per category.
  const byCategory = new Map<string, VaultDocument>()
  for (const d of docs) {
    if (!isReusable(d, now)) continue
    const prev = byCategory.get(d.metadata.category)
    if (!prev || d.createdAt > prev.createdAt) byCategory.set(d.metadata.category, d)
  }
  const reusable: VaultDocument[] = []
  const missing: string[] = []
  for (const t of requiredTypes) {
    const d = byCategory.get(t)
    if (d) reusable.push(d)
    else missing.push(t)
  }
  return { reusable, missing }
}
