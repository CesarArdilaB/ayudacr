import { describe, expect, it } from 'vitest'
import {
    ASSESSMENT_CRITERIA,
    ASSESSMENT_SECTIONS,
    parseAssessmentSubmission,
} from './assessment.js'

function completeSubmission() {
    return {
        institution: '  Coliseo El Pueblo  ',
        visitDate: '2026-08-15',
        municipality: ' Cali ',
        department: ' Valle del Cauca ',
        contactName: ' Ana Torres ',
        contactRole: ' Coordinadora ',
        phone: ' 300 000 0000 ',
        email: ' ANA@EXAMPLE.COM ',
        protectionRiskDetails: ' Sin detalles adicionales ',
        generalObservations: ' Visita realizada en la mañana ',
        visitors: [' Carlos Ruiz ', '', ' Laura Díaz '],
        responses: ASSESSMENT_CRITERIA.map((criterion) => ({
            criterionKey: criterion.key,
            answer: 'yes',
            comments: ` Observación ${criterion.key} `,
        })),
    }
}

describe('assessment catalog', () => {
    it('captures all six paper sections and 44 criteria', () => {
        expect(ASSESSMENT_SECTIONS.map((section) => section.title)).toEqual([
            'Dignidad y grupos con necesidades específicas de protección',
            'Acceso',
            'Participación',
            'Seguridad',
            'Principales riesgos de protección identificados',
            'Alertas inmediatas',
        ])
        expect(ASSESSMENT_CRITERIA).toHaveLength(44)
    })

    it('preserves the first and last criteria from the photographed form', () => {
        expect(ASSESSMENT_CRITERIA.at(0)?.label).toContain('Mujeres embarazadas')
        expect(ASSESSMENT_CRITERIA.at(-1)?.label).toContain('Percepción negativa de la comunidad')
    })
})

describe('parseAssessmentSubmission', () => {
    it('normalizes a complete submission', () => {
        const result = parseAssessmentSubmission(completeSubmission())

        expect(result.success).toBe(true)
        if (!result.success) return

        expect(result.data).toMatchObject({
            institution: 'Coliseo El Pueblo',
            municipality: 'Cali',
            email: 'ana@example.com',
            visitors: ['Carlos Ruiz', 'Laura Díaz'],
        })
        expect(result.data.responses[0]?.comments).toBe('Observación dignity_pregnant')
    })

    it('rejects missing shelter identity fields', () => {
        const result = parseAssessmentSubmission({
            ...completeSubmission(),
            institution: ' ',
            municipality: '',
        })

        expect(result).toEqual({
            success: false,
            errors: ['institution is required', 'municipality is required'],
        })
    })

    it('rejects a submission with an unanswered criterion', () => {
        const submission = completeSubmission()
        submission.responses = submission.responses.slice(1)

        const result = parseAssessmentSubmission(submission)

        expect(result).toEqual({
            success: false,
            errors: ['A valid answer is required for dignity_pregnant'],
        })
    })

    it('rejects unknown criteria and duplicate answers', () => {
        const submission = completeSubmission()
        const firstResponse = submission.responses.at(0)
        if (!firstResponse) throw new Error('Expected a complete submission')
        submission.responses.push(firstResponse, {
            criterionKey: 'unknown_item',
            answer: 'yes',
            comments: '',
        })

        const result = parseAssessmentSubmission(submission)

        expect(result).toEqual({
            success: false,
            errors: ['Duplicate answer for dignity_pregnant', 'Unknown criterion: unknown_item'],
        })
    })
})
