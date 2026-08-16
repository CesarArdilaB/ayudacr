import type { AddressInfo } from 'node:net'
import express from 'express'
import { afterEach, describe, expect, it } from 'vitest'
import { ASSESSMENT_CRITERIA } from '../shared/assessment.js'
import {
    type AssessmentRepository,
    createAssessmentsRouter,
    type SessionResolver,
} from './assessments.js'

const openServers: ReturnType<ReturnType<typeof express>['listen']>[] = []

afterEach(async () => {
    await Promise.all(
        openServers
            .splice(0)
            .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    )
})

function validSubmission() {
    return {
        institution: 'Coliseo El Pueblo',
        visitDate: '2026-08-15',
        municipality: 'Cali',
        department: 'Valle del Cauca',
        contactName: 'Ana Torres',
        contactRole: 'Coordinadora',
        phone: '3000000000',
        email: 'ana@example.com',
        protectionRiskDetails: '',
        generalObservations: '',
        visitors: ['Carlos Ruiz'],
        photos: [
            {
                data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]).toString('base64'),
                mimeType: 'image/jpeg',
            },
        ],
        responses: ASSESSMENT_CRITERIA.map((criterion) => ({
            criterionKey: criterion.key,
            answer: 'yes',
            comments: '',
            quantities: criterion.key === 'dignity_population_total' ? { men: 18, women: 22 } : {},
        })),
    }
}

async function startTestApi(sessionResolver: SessionResolver, repository: AssessmentRepository) {
    const app = express()
    app.use(express.json())
    app.use('/api/assessments', createAssessmentsRouter({ sessionResolver, repository }))

    const server = app.listen(0, '127.0.0.1')
    openServers.push(server)
    await new Promise<void>((resolve) => server.once('listening', resolve))
    const address = server.address() as AddressInfo

    return `http://127.0.0.1:${address.port}/api/assessments`
}

describe('POST /api/assessments', () => {
    it('rejects an unauthenticated request without persisting it', async () => {
        let persistenceCalls = 0
        const url = await startTestApi(async () => null, {
            async create() {
                persistenceCalls += 1
                return { id: 'not-created' }
            },
        })

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(validSubmission()),
        })

        expect(response.status).toBe(401)
        expect(await response.json()).toEqual({ error: 'Authentication required' })
        expect(persistenceCalls).toBe(0)
    })

    it('returns validation details for an incomplete assessment', async () => {
        const url = await startTestApi(async () => ({ user: { id: 'user-1' } }), {
            async create() {
                return { id: 'not-created' }
            },
        })

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ institution: '' }),
        })

        expect(response.status).toBe(400)
        expect(await response.json()).toMatchObject({
            error: 'Assessment validation failed',
            details: expect.arrayContaining([
                'institution is required',
                'A valid answer is required for dignity_pregnant',
            ]),
        })
    })

    it('persists a valid assessment for the authenticated user', async () => {
        const captured: Array<{
            userId: string
            institution: string
            responseCount: number
            populationQuantities: Record<string, number> | undefined
            photoCount: number
        }> = []
        const url = await startTestApi(async () => ({ user: { id: 'user-42' } }), {
            async create(submission, userId) {
                captured.push({
                    userId,
                    institution: submission.institution,
                    responseCount: submission.responses.length,
                    populationQuantities: submission.responses.find(
                        (item) => item.criterionKey === 'dignity_population_total',
                    )?.quantities,
                    photoCount: submission.photos.length,
                })
                return { id: 'assessment-123' }
            },
        })

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(validSubmission()),
        })

        expect(response.status).toBe(201)
        expect(await response.json()).toEqual({ id: 'assessment-123' })
        expect(captured).toEqual([
            {
                userId: 'user-42',
                institution: 'Coliseo El Pueblo',
                responseCount: 44,
                populationQuantities: { men: 18, women: 22 },
                photoCount: 1,
            },
        ])
    })
})
