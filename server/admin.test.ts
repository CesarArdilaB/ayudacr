import type { AddressInfo } from 'node:net'
import express from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type AdminSessionResolver, createAdminRouter } from './admin.js'

type AdminAssessment = {
    id: string
    institution: string
    visitDate: string
    municipality: string
    department: string
    createdAt: string
    createdBy: { name: string; email: string }
    responseCount: number
}

type ConfigurableAdminRouter = (options: {
    sessionResolver: AdminSessionResolver
    assessmentRepository: { list: () => Promise<AdminAssessment[]> }
}) => ReturnType<typeof createAdminRouter>

const openServers: ReturnType<ReturnType<typeof express>['listen']>[] = []

afterEach(async () => {
    await Promise.all(
        openServers
            .splice(0)
            .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    )
})

async function startAdminApi(options: Parameters<ConfigurableAdminRouter>[0]) {
    const app = express()
    app.use(express.json())
    app.use('/api/admin', (createAdminRouter as ConfigurableAdminRouter)(options))
    const server = app.listen(0, '127.0.0.1')
    openServers.push(server)
    await new Promise<void>((resolve) => server.once('listening', resolve))
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin`
}

function adminSession(): ReturnType<AdminSessionResolver> {
    return Promise.resolve({ user: { id: 'admin-1', role: 'super_admin' } })
}

function evaluatorSession(): ReturnType<AdminSessionResolver> {
    return Promise.resolve({ user: { id: 'user-1', role: 'evaluator' } })
}

describe('super admin API', () => {
    it('denies an evaluator access before reading protected records', async () => {
        const list = vi.fn().mockResolvedValue([])
        const url = await startAdminApi({
            sessionResolver: evaluatorSession,
            assessmentRepository: { list },
        })

        const response = await fetch(`${url}/assessments`)

        expect(response.status).toBe(403)
        expect(await response.json()).toEqual({ error: 'Super admin access required' })
        expect(list).not.toHaveBeenCalled()
    })

    it('lists assessment summaries for a super admin', async () => {
        const records: AdminAssessment[] = [
            {
                id: 'assessment-1',
                institution: 'Coliseo Central',
                visitDate: '2026-08-15',
                municipality: 'Pereira',
                department: 'Risaralda',
                createdAt: '2026-08-15T20:00:00.000Z',
                createdBy: { name: 'Ana Torres', email: 'ana@example.com' },
                responseCount: 44,
            },
        ]
        const url = await startAdminApi({
            sessionResolver: adminSession,
            assessmentRepository: { list: vi.fn().mockResolvedValue(records) },
        })

        const response = await fetch(`${url}/assessments`)

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ records })
    })

    it('does not expose a user-creation endpoint', async () => {
        const url = await startAdminApi({
            sessionResolver: adminSession,
            assessmentRepository: { list: vi.fn() },
        })

        const response = await fetch(`${url}/users`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                name: '  Luis Campo ',
                email: ' LUIS@EXAMPLE.COM ',
                password: 'segura-123',
            }),
        })

        expect(response.status).toBe(404)
    })
})
