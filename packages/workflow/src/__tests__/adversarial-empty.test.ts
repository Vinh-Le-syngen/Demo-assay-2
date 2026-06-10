import { describe, it, expect } from 'vitest'
import { validateWorkflowDefinition, type WorkflowDefinition } from '../definition'

// adversarial (protocol-misuse) — definitions crafted to render unsatisfiable controls or to be
// structurally empty: a select field with no options (an empty/unselectable control), a
// documentChecklist entry not backed by requiredDocTypes, and a wholly empty definition. The
// validator is the gatekeeper's last line and must catch every one without throwing.

describe('adversarial — empty / unsatisfiable definitions the validator must reject', () => {
  it('rejects a select field with no options and a checklist entry not in requiredDocTypes', () => {
    const hostile: WorkflowDefinition = {
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
            documentChecklist: ['passport'], // not in requiredDocTypes → inconsistency
            fields: [{ key: 's', labelKey: 'l.s', type: 'select', required: true, visibleTo: ['agent'], options: [] }],
          },
        },
      ],
      transitions: {},
    }
    const errs = validateWorkflowDefinition(hostile)
    expect(errs.some((e) => e.includes('select field') && e.includes('needs options'))).toBe(true)
    expect(errs.some((e) => e.includes("documentChecklist 'passport' not in requiredDocTypes"))).toBe(true)
  })

  it('rejects a wholly empty definition and non-contiguous stage numbering, never throwing', () => {
    const empty = validateWorkflowDefinition({ serviceType: '', country: 'xx', stages: [], transitions: {} } as WorkflowDefinition)
    expect(empty.some((e) => e.includes('serviceType is required'))).toBe(true)
    expect(empty.some((e) => e.includes('at least one stage'))).toBe(true)
    expect(empty.some((e) => e.includes('ISO-3166'))).toBe(true)

    // stage numbers smuggled out of the contiguous 1..N sequence must be flagged.
    const gappy: WorkflowDefinition = {
      serviceType: 'svc',
      country: 'AE',
      stages: [
        {
          key: 'a', number: 1, labelKey: 'stage.a', actor: 'agent', requiredDocTypes: [], gates: [], sideEffects: [],
          presentation: { titleKey: 't.a', primaryActionKey: 'go', documentChecklist: [], fields: [] },
        },
        {
          key: 'b', number: 9, labelKey: 'stage.b', actor: 'agent', requiredDocTypes: [], gates: [], sideEffects: [],
          presentation: { titleKey: 't.b', primaryActionKey: 'go', documentChecklist: [], fields: [] },
        },
      ],
      transitions: { a: ['b'] },
    }
    const errs = validateWorkflowDefinition(gappy)
    expect(errs.some((e) => e.includes('stage numbers must be contiguous'))).toBe(true)
  })
})
