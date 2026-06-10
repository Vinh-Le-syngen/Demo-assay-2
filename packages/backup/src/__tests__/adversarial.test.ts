// adversarial (protocol-misuse) — the manifest checksum is the verification anchor a restore
// trusts; it must DETECT tampering with the recorded set, and must not be forgeable by
// reordering or by colliding path/size field boundaries.
import { describe, it, expect } from 'vitest'
import { manifestChecksum, type BackupObject } from '../core'

const obj = (path: string, size: number, version = 'v1'): BackupObject => ({ path, size, version })

describe('adversarial — manifest checksum tampering detection', () => {
  it('detects a silently mutated object (size changed under the same path)', () => {
    const original = [obj('docs/passport.pdf', 1024), obj('docs/visa.pdf', 512)]
    const recorded = manifestChecksum(original)

    // attacker swaps in a smaller (truncated/corrupted) passport but keeps the path
    const tampered = [obj('docs/passport.pdf', 16), obj('docs/visa.pdf', 512)]
    expect(manifestChecksum(tampered)).not.toBe(recorded)
  })

  it('detects an added or dropped object, not just a changed one', () => {
    const base = [obj('a', 1), obj('b', 2)]
    const recorded = manifestChecksum(base)
    expect(manifestChecksum([obj('a', 1)])).not.toBe(recorded) // dropped 'b'
    expect(manifestChecksum([...base, obj('c', 3)])).not.toBe(recorded) // injected 'c'
  })

  it('is NOT forgeable by reordering — order is normalized, so a reorder is not a tamper signal', () => {
    const a = manifestChecksum([obj('a', 1), obj('b', 2)])
    const b = manifestChecksum([obj('b', 2), obj('a', 1)])
    expect(a).toBe(b) // reorder is benign by design; only content changes flip the anchor
  })

  it('flips when a single field byte changes (no false-stable digest)', () => {
    // The anchor must be sensitive to a one-byte change anywhere in path or size — an
    // attacker cannot perturb content while holding the digest fixed.
    const recorded = manifestChecksum([obj('a', 1), obj('b', 2)])
    expect(manifestChecksum([obj('a', 1), obj('b', 3)])).not.toBe(recorded) // size byte
    expect(manifestChecksum([obj('a', 1), obj('c', 2)])).not.toBe(recorded) // path byte
  })

  it('is NOT forgeable by colliding field boundaries (separator chars in a path)', () => {
    // A delimiter-joined "path:size" anchor is forgeable: a single object whose path
    // embeds the field (':') and line ('\n') separators can reproduce the exact joined
    // bytes of a different, honest multi-object set. Here a one-object set and a
    // two-object set both flatten to the string "a:1\nb:2" under the naive encoding —
    // their digests MUST differ once the encoding is unambiguous.
    const forged = manifestChecksum([obj('a:1\nb', 2)])
    const honest = manifestChecksum([obj('a', 1), obj('b', 2)])
    expect(forged).not.toBe(honest)
  })
})
