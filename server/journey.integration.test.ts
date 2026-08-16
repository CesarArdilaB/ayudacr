import type { Server } from 'node:http'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { fromNodeHeaders } from 'better-auth/node'
import { afterEach, describe, expect, it } from 'vitest'
import { ASSESSMENT_CRITERIA, type AssessmentSubmission } from '../shared/assessment.js'
import { createApp } from './app.js'
import type { AssessmentRepository, SessionResolver } from './assessments.js'
import { createAuth } from './auth.js'

const authConfig = {
    authSecret: 'integration-test-secret-that-is-longer-than-thirty-two-characters',
    authUrl: 'http://127.0.0.1',
    databaseUrl: 'memory://integration-test',
    port: 3005,
    trustedOrigins: ['http://127.0.0.1'],
}

function completeAssessment(): AssessmentSubmission {
    return {
        institution: 'Albergue Central',
        visitDate: '2026-08-15',
        municipality: 'Pereira',
        department: 'Risaralda',
        contactName: 'Ana Gómez',
        contactRole: 'Coordinadora',
        phone: '3001234567',
        email: 'ana@example.com',
        protectionRiskDetails: 'Sin alertas adicionales.',
        generalObservations: 'Alojamiento operativo.',
        visitors: ['Equipo de campo'],
        photos: [],
        responses: ASSESSMENT_CRITERIA.map((criterion) => ({
            criterionKey: criterion.key,
            answer: 'yes',
            comments: '',
            quantities: {},
        })),
    }
}

function sessionCookie(response: Response): string {
    const cookie = response.headers.get('set-cookie')?.split(';')[0]
    if (!cookie) throw new Error('Expected Better Auth to set a session cookie')
    return cookie
}

describe('release-critical evaluator journey', () => {
    let server: Server | undefined

    afterEach(
        () =>
            new Promise<void>((resolve) => {
                if (!server) return resolve()
                server.close(() => resolve())
                server = undefined
            }),
    )

    it('signs up, logs in, restores the session, and captures a complete assessment', async () => {
        const testAuth = createAuth(
            memoryAdapter({ user: [], session: [], account: [], verification: [] }),
            authConfig,
            { allowPublicSignUp: true },
        )
        const saved: Array<{ submission: AssessmentSubmission; userId: string }> = []
        const repository: AssessmentRepository = {
            async create(submission, userId) {
                saved.push({ submission, userId })
                return { id: 'assessment-release-smoke' }
            },
        }
        const sessionResolver: SessionResolver = async (headers) => {
            const session = await testAuth.api.getSession({ headers: fromNodeHeaders(headers) })
            return session ? { user: { id: session.user.id } } : null
        }
        const configurableCreateApp = createApp as unknown as (options: {
            authInstance: typeof testAuth
            assessmentRepository: AssessmentRepository
            sessionResolver: SessionResolver
        }) => ReturnType<typeof createApp>
        const app = configurableCreateApp({
            authInstance: testAuth,
            assessmentRepository: repository,
            sessionResolver,
        })

        let activeServer!: Server
        await new Promise<void>((resolve, reject) => {
            activeServer = app.listen(0, '127.0.0.1', (error) =>
                error ? reject(error) : resolve(),
            )
        })
        server = activeServer
        const address = activeServer.address()
        if (!address || typeof address === 'string') throw new Error('Expected a TCP address')
        const origin = `http://127.0.0.1:${address.port}`

        const signUpResponse = await fetch(`${origin}/api/auth/sign-up/email`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1' },
            body: JSON.stringify({
                name: 'Evaluadora Móvil',
                email: 'evaluadora@example.com',
                password: 'secure-field-password',
            }),
        })
        expect(signUpResponse.status).toBe(200)
        expect(await signUpResponse.json()).toMatchObject({
            user: { email: 'evaluadora@example.com', name: 'Evaluadora Móvil' },
        })

        const signInResponse = await fetch(`${origin}/api/auth/sign-in/email`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1' },
            body: JSON.stringify({
                email: 'evaluadora@example.com',
                password: 'secure-field-password',
            }),
        })
        expect(signInResponse.status).toBe(200)
        const cookie = sessionCookie(signInResponse)

        const sessionResponse = await fetch(`${origin}/api/auth/get-session`, {
            headers: { cookie },
        })
        expect(sessionResponse.status).toBe(200)
        expect(await sessionResponse.json()).toMatchObject({
            user: { email: 'evaluadora@example.com' },
        })

        const assessment = completeAssessment()
        const assessmentResponse = await fetch(`${origin}/api/assessments`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie },
            body: JSON.stringify(assessment),
        })
        expect(assessmentResponse.status).toBe(201)
        expect(await assessmentResponse.json()).toEqual({ id: 'assessment-release-smoke' })
        expect(saved).toHaveLength(1)
        expect(saved[0]).toMatchObject({
            userId: expect.any(String),
            submission: { responses: expect.arrayContaining(assessment.responses) },
        })
        expect(saved[0]?.submission.responses).toHaveLength(44)
    })
})
