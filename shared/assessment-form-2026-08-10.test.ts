// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { ASSESSMENT_SECTIONS } from './assessment.js'
import { ASSESSMENT_FORM_2026_08_10 } from './assessment-form-2026-08-10.js'

describe('2026-08-10 assessment form snapshot', () => {
    it('has a stable historical fingerprint and remains the public current form', () => {
        const serialized = JSON.stringify(ASSESSMENT_FORM_2026_08_10)
        let fingerprint = 2_166_136_261
        for (const character of serialized) {
            fingerprint ^= character.charCodeAt(0)
            fingerprint = Math.imul(fingerprint, 16_777_619)
        }

        expect((fingerprint >>> 0).toString(16).padStart(8, '0')).toBe('dc4b396b')
        expect(ASSESSMENT_FORM_2026_08_10).toHaveLength(6)
        expect(
            ASSESSMENT_FORM_2026_08_10.reduce(
                (total, section) => total + section.criteria.length,
                0,
            ),
        ).toBe(44)
        expect(ASSESSMENT_SECTIONS).toBe(ASSESSMENT_FORM_2026_08_10)
    })
})
