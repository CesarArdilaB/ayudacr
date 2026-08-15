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

type AdminUser = {
    id: string
    name: string
    email: string
    role: 'evaluator' | 'super_admin'
    createdAt: string
}

type AdminUserService = {
    list: () => Promise<AdminUser[]>
    create: (input: { name: string; email: string; password: string }) => Promise<AdminUser>
    updatePassword: (userId: string, password: string) => Promise<void>
    promote: (userId: string) => Promise<AdminUser>
}

type ConfigurableAdminRouter = (options: {
    sessionResolver: AdminSessionResolver
    assessmentRepository: { list: () => Promise<AdminAssessment[]> }
    userService?: AdminUserService
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

    it('lists users for a super admin', async () => {
        const users: AdminUser[] = [
            {
                id: 'user-1',
                name: 'Ana Torres',
                email: 'ana@example.com',
                role: 'evaluator',
                createdAt: '2026-08-15T20:00:00.000Z',
            },
        ]
        const userService: AdminUserService = {
            list: vi.fn().mockResolvedValue(users),
            create: vi.fn(),
            updatePassword: vi.fn(),
            promote: vi.fn(),
        }
        const url = await startAdminApi({
            sessionResolver: adminSession,
            assessmentRepository: { list: vi.fn() },
            userService,
        })

        const response = await fetch(`${url}/users`)

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ users })
        expect(userService.list).toHaveBeenCalledOnce()
    })

    it('creates an evaluator with normalized details', async () => {
        const created: AdminUser = {
            id: 'user-2',
            name: 'Luis Campo',
            email: 'luis@example.com',
            role: 'evaluator',
            createdAt: '2026-08-15T21:00:00.000Z',
        }
        const userService: AdminUserService = {
            list: vi.fn(),
            create: vi.fn().mockResolvedValue(created),
            updatePassword: vi.fn(),
            promote: vi.fn(),
        }
        const url = await startAdminApi({
            sessionResolver: adminSession,
            assessmentRepository: { list: vi.fn() },
            userService,
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

        expect(response.status).toBe(201)
        expect(await response.json()).toEqual({ user: created })
        expect(userService.create).toHaveBeenCalledWith({
            name: 'Luis Campo',
            email: 'luis@example.com',
            password: 'segura-123',
        })
    })

    it('rejects an overlong user password before account creation', async () => {
        const userService: AdminUserService = {
            list: vi.fn(),
            create: vi.fn(),
            updatePassword: vi.fn(),
            promote: vi.fn(),
        }
        const url = await startAdminApi({
            sessionResolver: adminSession,
            assessmentRepository: { list: vi.fn() },
            userService,
        })

        const response = await fetch(`${url}/users`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                name: 'Luis Campo',
                email: 'luis@example.com',
                password: 'x'.repeat(129),
            }),
        })

        expect(response.status).toBe(400)
        expect(userService.create).not.toHaveBeenCalled()
    })

    it('updates a user password without returning it', async () => {
        const userService: AdminUserService = {
            list: vi.fn(),
            create: vi.fn(),
            updatePassword: vi.fn().mockResolvedValue(undefined),
            promote: vi.fn(),
        }
        const url = await startAdminApi({
            sessionResolver: adminSession,
            assessmentRepository: { list: vi.fn() },
            userService,
        })

        const response = await fetch(`${url}/users/user-1/password`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: 'nueva-segura-456' }),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ success: true })
        expect(userService.updatePassword).toHaveBeenCalledWith('user-1', 'nueva-segura-456')
    })

    it('promotes an evaluator to super admin', async () => {
        const promoted: AdminUser = {
            id: 'user-1',
            name: 'Ana Torres',
            email: 'ana@example.com',
            role: 'super_admin',
            createdAt: '2026-08-15T20:00:00.000Z',
        }
        const userService: AdminUserService = {
            list: vi.fn(),
            create: vi.fn(),
            updatePassword: vi.fn(),
            promote: vi.fn().mockResolvedValue(promoted),
        }
        const url = await startAdminApi({
            sessionResolver: adminSession,
            assessmentRepository: { list: vi.fn() },
            userService,
        })

        const response = await fetch(`${url}/users/user-1/role`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ role: 'super_admin' }),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ user: promoted })
        expect(userService.promote).toHaveBeenCalledWith('user-1')
    })

    it('denies evaluator access to user administration', async () => {
        const userService: AdminUserService = {
            list: vi.fn(),
            create: vi.fn(),
            updatePassword: vi.fn(),
            promote: vi.fn(),
        }
        const url = await startAdminApi({
            sessionResolver: evaluatorSession,
            assessmentRepository: { list: vi.fn() },
            userService,
        })

        const response = await fetch(`${url}/users`)

        expect(response.status).toBe(403)
        expect(userService.list).not.toHaveBeenCalled()
    })
})
