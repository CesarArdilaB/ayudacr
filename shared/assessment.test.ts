import { describe, expect, it } from 'vitest'
import {
    ASSESSMENT_CRITERIA,
    ASSESSMENT_SECTIONS,
    type AssessmentSubmission,
    parseAssessmentSubmission,
} from './assessment.js'

function completeSubmission(): AssessmentSubmission {
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
            answer: 'yes' as const,
            comments: ` Observación ${criterion.key} `,
            quantities: (criterion.key === 'dignity_population_total'
                ? { men: 18, women: 22 }
                : {}) as Record<string, number>,
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

    it('uses Sugerencias in PQRSF and defines structured quantity fields', () => {
        const feedback = ASSESSMENT_CRITERIA.find(
            (criterion) => criterion.key === 'participation_feedback_channels',
        )
        const population = ASSESSMENT_CRITERIA.find(
            (criterion) => criterion.key === 'dignity_population_total',
        )

        expect(feedback?.label).toContain('sugerencias')
        expect(feedback?.label).not.toContain('solicitudes')
        expect(population?.quantityFields).toEqual([
            { key: 'men', label: 'Cantidad de hombres' },
            { key: 'women', label: 'Cantidad de mujeres' },
        ])
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
        expect(
            result.data.responses.find(
                (response) => response.criterionKey === 'dignity_population_total',
            )?.quantities,
        ).toEqual({ men: 18, women: 22 })
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
            quantities: {},
        })

        const result = parseAssessmentSubmission(submission)

        expect(result).toEqual({
            success: false,
            errors: ['Duplicate answer for dignity_pregnant', 'Unknown criterion: unknown_item'],
        })
    })

    it('rejects invalid or unexpected quantities', () => {
        const submission = completeSubmission()
        const population = submission.responses.find(
            (response) => response.criterionKey === 'dignity_population_total',
        )
        if (!population) throw new Error('Expected population response')
        population.quantities = { men: -1, women: 2.5, children: 4 }

        const result = parseAssessmentSubmission(submission)

        expect(result).toEqual({
            success: false,
            errors: [
                'Quantity men for dignity_population_total must be a non-negative integer',
                'Quantity women for dignity_population_total must be a non-negative integer',
                'Unknown quantity children for dignity_population_total',
            ],
        })
    })
})
