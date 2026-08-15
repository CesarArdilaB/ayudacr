import { afterEach, describe, expect, it, vi } from 'vitest'
import * as adminApi from './admin-api.js'

const { createEvaluator, listAdminUsers, promoteAdminUser, updateAdminUserPassword } =
    adminApi as typeof adminApi & {
        createEvaluator: (input: {
            name: string
            email: string
            password: string
        }) => Promise<unknown>
        listAdminUsers: () => Promise<{ users: unknown[] }>
        promoteAdminUser: (userId: string) => Promise<unknown>
        updateAdminUserPassword: (userId: string, password: string) => Promise<unknown>
    }

afterEach(() => vi.unstubAllGlobals())

function respond(body: unknown, status = 200) {
    return Promise.resolve(
        new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
        }),
    )
}

describe('admin user API', () => {
    it('lists users with authenticated credentials', async () => {
        const fetcher = vi.fn().mockImplementation(() => respond({ users: [] }))
        vi.stubGlobal('fetch', fetcher)

        await expect(listAdminUsers()).resolves.toEqual({ users: [] })
        expect(fetcher).toHaveBeenCalledWith('/api/admin/users', {
            credentials: 'include',
            headers: { accept: 'application/json' },
        })
    })

    it('creates an evaluator', async () => {
        const input = { name: 'Ana Torres', email: 'ana@example.com', password: 'segura-123' }
        const fetcher = vi.fn().mockImplementation(() =>
            respond({
                user: {
                    id: 'user-1',
                    name: input.name,
                    email: input.email,
                    role: 'evaluator',
                    createdAt: '2026-08-15T20:00:00.000Z',
                },
            }),
        )
        vi.stubGlobal('fetch', fetcher)

        await createEvaluator(input)

        expect(fetcher).toHaveBeenCalledWith('/api/admin/users', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input),
        })
    })

    it('updates a selected user password', async () => {
        const fetcher = vi.fn().mockImplementation(() => respond({ success: true }))
        vi.stubGlobal('fetch', fetcher)

        await updateAdminUserPassword('user-1', 'nueva-segura-456')

        expect(fetcher).toHaveBeenCalledWith('/api/admin/users/user-1/password', {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: 'nueva-segura-456' }),
        })
    })

    it('promotes a selected user to super admin', async () => {
        const fetcher = vi.fn().mockImplementation(() =>
            respond({
                user: {
                    id: 'user-1',
                    name: 'Ana Torres',
                    email: 'ana@example.com',
                    role: 'super_admin',
                    createdAt: '2026-08-15T20:00:00.000Z',
                },
            }),
        )
        vi.stubGlobal('fetch', fetcher)

        await promoteAdminUser('user-1')

        expect(fetcher).toHaveBeenCalledWith('/api/admin/users/user-1/role', {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ role: 'super_admin' }),
        })
    })

    it('returns a useful error when an upstream response is not JSON', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response('Gateway unavailable', { status: 502 })),
        )

        await expect(listAdminUsers()).rejects.toThrow('La solicitud no pudo completarse.')
    })
})
