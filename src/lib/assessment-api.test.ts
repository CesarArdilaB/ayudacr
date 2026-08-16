import { describe, expect, it } from 'vitest'
import type { AssessmentSubmission } from '../../shared/assessment.js'
import { postAssessment } from './assessment-api'

const submission = { institution: 'Coliseo El Pueblo' } as AssessmentSubmission

describe('postAssessment', () => {
    it('posts JSON credentials to the assessment endpoint', async () => {
        const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
        const result = await postAssessment(submission, async (input, init) => {
            requests.push({ input, init })
            return new Response(JSON.stringify({ id: 'assessment-1' }), {
                status: 201,
                headers: { 'content-type': 'application/json' },
            })
        })

        expect(result).toEqual({ id: 'assessment-1' })
        expect(requests).toEqual([
            {
                input: '/api/assessments',
                init: {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(submission),
                },
            },
        ])
    })

    it('surfaces the API error message', async () => {
        await expect(
            postAssessment(
                submission,
                async () =>
                    new Response(JSON.stringify({ error: 'Unable to save the assessment' }), {
                        status: 500,
                        headers: { 'content-type': 'application/json' },
                    }),
            ),
        ).rejects.toThrow('Unable to save the assessment')
    })

    it('translates validation details returned by the API', async () => {
        await expect(
            postAssessment(
                submission,
                async () =>
                    new Response(
                        JSON.stringify({
                            error: 'Assessment validation failed',
                            details: ['email must be valid'],
                        }),
                        {
                            status: 400,
                            headers: { 'content-type': 'application/json' },
                        },
                    ),
            ),
        ).rejects.toThrow('El correo de contacto no es válido.')
    })

    it('translates server-side field limits into actionable Spanish', async () => {
        await expect(
            postAssessment(
                submission,
                async () =>
                    new Response(
                        JSON.stringify({
                            error: 'Assessment validation failed',
                            details: [
                                'comments for dignity_pregnant must be at most 2000 characters',
                            ],
                        }),
                        { status: 400, headers: { 'content-type': 'application/json' } },
                    ),
            ),
        ).rejects.toThrow('Uno de los campos supera el máximo permitido.')
    })

    it('translates a non-JSON payload-too-large response', async () => {
        await expect(
            postAssessment(
                submission,
                async () =>
                    new Response('Request Entity Too Large', {
                        status: 413,
                        headers: { 'content-type': 'text/plain' },
                    }),
            ),
        ).rejects.toThrow(
            'Las fotos exceden el tamaño permitido. Eliminá una foto o intentá nuevamente.',
        )
    })
})
