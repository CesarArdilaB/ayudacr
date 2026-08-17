import type { Server } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ASSESSMENT_CRITERIA } from '../shared/assessment.js'
import {
    type AdminAssessmentRepository,
    type AdminSessionResolver,
    CURRENT_ASSESSMENT_FORM_VERSION,
} from './admin.js'
import { createApp } from './app.js'

describe('API readiness', () => {
    let server: Server | undefined

    afterEach(
        () =>
            new Promise<void>((resolve) => {
                if (!server) return resolve()
                server.close(() => resolve())
                server = undefined
            }),
    )

    it('reports a database outage instead of declaring auth ready', async () => {
        const configurableCreateApp = createApp as unknown as (options: {
            healthCheck: () => Promise<void>
        }) => ReturnType<typeof createApp>
        const app = configurableCreateApp({
            healthCheck: async () => {
                throw new Error('database unavailable')
            },
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

        const response = await fetch(`http://127.0.0.1:${address.port}/api/health`)

        expect(response.status).toBe(503)
        expect(await response.json()).toEqual({
            status: 'error',
            checks: { database: 'unavailable' },
        })
    })

    it('protects the admin records endpoint from signed-out requests', async () => {
        const app = createApp()

        let activeServer!: Server
        await new Promise<void>((resolve, reject) => {
            activeServer = app.listen(0, '127.0.0.1', (error) =>
                error ? reject(error) : resolve(),
            )
        })
        server = activeServer
        const address = activeServer.address()
        if (!address || typeof address === 'string') throw new Error('Expected a TCP address')

        const response = await fetch(`http://127.0.0.1:${address.port}/api/admin/assessments`)

        expect(response.status).toBe(401)
        expect(await response.json()).toEqual({ error: 'Authentication required' })
    })

    it('accepts assessment JSON above the default 100 KB parser limit', async () => {
        let capturedPhotos = 0
        const app = createApp({
            sessionResolver: async () => ({ user: { id: 'user-1' } }),
            assessmentRepository: {
                async create(submission) {
                    capturedPhotos = submission.photos.length
                    return { id: 'assessment-large-json' }
                },
            },
        })
        server = await listen(app)
        const photo = Buffer.alloc(120_000, 0)
        photo.set([0xff, 0xd8, 0xff], 0)
        photo.set([0xff, 0xd9], photo.length - 2)

        const response = await fetch(`${serverOrigin(server)}/api/assessments`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(assessmentPayload(photo.toString('base64'))),
        })

        expect(response.status).toBe(201)
        expect(capturedPhotos).toBe(1)
    })

    it('returns JSON when assessment JSON exceeds 4 MB', async () => {
        const app = createApp({
            sessionResolver: async () => ({ user: { id: 'user-1' } }),
            assessmentRepository: {
                async create() {
                    return { id: 'never' }
                },
            },
        })
        server = await listen(app)

        const response = await fetch(`${serverOrigin(server)}/api/assessments`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ oversized: 'a'.repeat(4 * 1024 * 1024) }),
        })

        expect(response.status).toBe(413)
        expect(await response.json()).toEqual({ error: 'Assessment payload is too large' })
    })

    it.each([
        ['signed out', async () => null, 401],
        ['evaluator', async () => ({ user: { id: 'user-1', role: 'evaluator' as const } }), 403],
    ])('authenticates a %s admin edit before parsing its body', async (_name, resolver, status) => {
        const repository = adminRepository()
        const app = createApp({
            adminSessionResolver: resolver as AdminSessionResolver,
            adminAssessmentRepository: repository,
        })
        server = await listen(app)

        const response = await fetch(
            `${serverOrigin(server)}/api/admin/assessments/9f3c0dc7-c892-4a7f-8130-8df6f65a8547`,
            {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: '{',
            },
        )

        expect(response.status).toBe(status)
        expect(repository.update).not.toHaveBeenCalled()
    })

    it.each([
        ['signed out', async () => null, 401],
        ['evaluator', async () => ({ user: { id: 'user-1', role: 'evaluator' as const } }), 403],
    ])(
        'rejects a %s admin edit above 4 MB before the body-size parser',
        async (_name, resolver, status) => {
            const repository = adminRepository()
            const app = createApp({
                adminSessionResolver: resolver as AdminSessionResolver,
                adminAssessmentRepository: repository,
            })
            server = await listen(app)

            const response = await fetch(
                `${serverOrigin(server)}/api/admin/assessments/9f3c0dc7-c892-4a7f-8130-8df6f65a8547`,
                {
                    method: 'PUT',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ oversized: 'a'.repeat(4 * 1024 * 1024) }),
                },
            )

            expect(response.status).toBe(status)
            expect(repository.update).not.toHaveBeenCalled()
        },
    )

    it('accepts an authorized admin edit above the default 100 KB parser limit', async () => {
        let savedPhotos = 0
        const repository = adminRepository({
            async update(input) {
                savedPhotos = input.assessment.photos.length
                return { status: 'updated', revision: '2026-08-16 09:00:00.000001-05' }
            },
        })
        const app = createApp({
            adminSessionResolver: async () => ({
                user: { id: 'admin-1', role: 'super_admin' },
            }),
            adminAssessmentRepository: repository,
        })
        server = await listen(app)
        const photo = Buffer.alloc(120_000, 0)
        photo.set([0xff, 0xd8, 0xff], 0)
        photo.set([0xff, 0xd9], photo.length - 2)

        const response = await fetch(
            `${serverOrigin(server)}/api/admin/assessments/9f3c0dc7-c892-4a7f-8130-8df6f65a8547`,
            {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    revision: '2026-08-16 08:00:00-05',
                    formVersion: CURRENT_ASSESSMENT_FORM_VERSION,
                    assessment: assessmentPayload(photo.toString('base64')),
                }),
            },
        )

        expect(response.status).toBe(200)
        expect(savedPhotos).toBe(1)
    })

    it('returns Spanish JSON when an authorized admin edit exceeds 4 MB', async () => {
        const app = createApp({
            adminSessionResolver: async () => ({
                user: { id: 'admin-1', role: 'super_admin' },
            }),
            adminAssessmentRepository: adminRepository(),
        })
        server = await listen(app)

        const response = await fetch(
            `${serverOrigin(server)}/api/admin/assessments/9f3c0dc7-c892-4a7f-8130-8df6f65a8547`,
            {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ oversized: 'a'.repeat(4 * 1024 * 1024) }),
            },
        )

        expect(response.status).toBe(413)
        expect(await response.json()).toEqual({
            error: 'El contenido de la evaluación es demasiado grande',
        })
    })

    it('keeps the default 100 KB JSON limit for unrelated admin user writes', async () => {
        const app = createApp({
            adminSessionResolver: async () => ({
                user: { id: 'admin-1', role: 'super_admin' },
            }),
            adminAssessmentRepository: adminRepository(),
        })
        server = await listen(app)

        const response = await fetch(`${serverOrigin(server)}/api/admin/users`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'a'.repeat(110_000) }),
        })

        expect(response.status).toBe(413)
    })
})

function adminRepository(
    overrides: Partial<AdminAssessmentRepository> = {},
): AdminAssessmentRepository {
    return {
        async list() {
            return []
        },
        async *streamCsvBatches() {},
        async findDetailed() {
            return null
        },
        findEditable: vi.fn().mockResolvedValue({ status: 'not_found' }),
        update: vi.fn().mockResolvedValue({ status: 'not_found' }),
        ...overrides,
    }
}

function assessmentPayload(photoData: string) {
    return {
        institution: 'Coliseo El Pueblo',
        visitDate: '2026-08-16',
        municipality: 'CALI',
        department: 'VALLE DEL CAUCA',
        contactName: 'Ana Torres',
        contactRole: '',
        phone: '',
        email: '',
        protectionRiskDetails: '',
        generalObservations: '',
        visitors: [],
        photos: [{ data: photoData, mimeType: 'image/jpeg' }],
        responses: ASSESSMENT_CRITERIA.map((criterion) => ({
            criterionKey: criterion.key,
            answer: 'yes',
            comments: '',
            quantities: {},
        })),
    }
}

async function listen(app: ReturnType<typeof createApp>) {
    let activeServer!: Server
    await new Promise<void>((resolve, reject) => {
        activeServer = app.listen(0, '127.0.0.1', (error) => (error ? reject(error) : resolve()))
    })
    return activeServer
}

function serverOrigin(activeServer: Server) {
    const address = activeServer.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP address')
    return `http://127.0.0.1:${address.port}`
}
