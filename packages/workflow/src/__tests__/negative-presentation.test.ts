import { describe, it, expect } from 'vitest'
import { validateWorkflowDefinition, type WorkflowDefinition } from '../definition'

// negative (presentation) — input-validation of a stage's presentation block: missing i18n keys,
// a field carrying an out-of-vocabulary type, and a field visible to no role must all surface as
// structured problems rather than throwing. The UI renders from presentation, so a malformed one
// is a rejectable input.

describe('negative — malformed presentation is reported, never thrown', () => {
  it('input-validation: malformed presentation + invalid field type are reported per stage', () => {
    const bad: WorkflowDefinition = {
      serviceType: 'svc',
      country: 'AE',
      stages: [
        {
          key: 'a',
          number: 1,
          labelKey: 'stage.a',
          actor: 'agent',
          requiredDocTypes: [],
          gates: [],
          sideEffects: [],
          // missing titleKey/primaryActionKey; a field with a bogus type and empty visibleTo
          presentation: {
            titleKey: '',
            primaryActionKey: '',
            documentChecklist: [],
            fields: [{ key: 'f', labelKey: 'l.f', type: 'wormhole' as never, required: false, visibleTo: [] }],
          },
        },
      ],
      transitions: {},
    }
    const errs = validateWorkflowDefinition(bad)
    expect(errs.some((e) => e.includes('missing titleKey'))).toBe(true)
    expect(errs.some((e) => e.includes('missing primaryActionKey'))).toBe(true)
    expect(errs.some((e) => e.includes("invalid type 'wormhole'"))).toBe(true)
    expect(errs.some((e) => e.includes('must be visible to'))).toBe(true)
  })

  it('input-validation: duplicate field keys and unknown visibleTo role / validation rule are flagged', () => {
    const bad: WorkflowDefinition = {
      serviceType: 'svc',
      country: 'AE',
      stages: [
        {
          key: 'a',
          number: 1,
          labelKey: 'stage.a',
          actor: 'agent',
          requiredDocTypes: [],
          gates: [],
          sideEffects: [],
          presentation: {
            titleKey: 't.a',
            primaryActionKey: 'go',
            documentChecklist: [],
            fields: [
              { key: 'dup', labelKey: 'l.1', type: 'text', required: false, visibleTo: ['agent'] },
              // duplicate key, an unknown role, and an unknown validation rule
              { key: 'dup', labelKey: 'l.2', type: 'text', required: false, visibleTo: ['wizard' as never], validation: ['teleport' as never] },
            ],
          },
        },
      ],
      transitions: {},
    }
    const errs = validateWorkflowDefinition(bad)
    expect(errs.some((e) => e.includes("duplicate field key 'dup'"))).toBe(true)
    expect(errs.some((e) => e.includes("invalid visibleTo role 'wizard'"))).toBe(true)
    expect(errs.some((e) => e.includes("unknown validation rule 'teleport'"))).toBe(true)
  })
})
