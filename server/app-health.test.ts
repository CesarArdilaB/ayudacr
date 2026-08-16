import type { Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { ASSESSMENT_CRITERIA } from '../shared/assessment.js'
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
})

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
