import { memoryAdapter } from 'better-auth/adapters/memory'
import { describe, expect, it } from 'vitest'
import * as authModule from './auth.js'

describe('Better Auth configuration', () => {
    it('exposes a factory so the real auth flow can be integration tested', () => {
        expect(authModule).toHaveProperty('createAuth')
        expect(typeof (authModule as Record<string, unknown>).createAuth).toBe('function')
    })

    it('uses a validated dynamic base URL for Vercel previews', () => {
        const createAuth = authModule.createAuth
        const vercelAuth = createAuth(
            memoryAdapter({ user: [], session: [], account: [], verification: [] }),
            {
                authSecret: 'vercel-preview-secret-that-is-longer-than-thirty-two-characters',
                authUrl: 'https://respuesta-colombia.vercel.app',
                databaseUrl: 'memory://vercel-preview',
                port: 3005,
                trustedOrigins: [
                    'https://respuesta-colombia.vercel.app',
                    'https://preview-123.vercel.app',
                    'https://*.vercel.app',
                ],
            },
        )

        expect(vercelAuth.options.baseURL).toEqual({
            allowedHosts: [
                'respuesta-colombia.vercel.app',
                'preview-123.vercel.app',
                '*.vercel.app',
            ],
            fallback: 'https://respuesta-colombia.vercel.app',
            protocol: 'https',
        })
    })

    it('exposes the stored role in authenticated user sessions without accepting it on sign-up', () => {
        const configuredAuth = authModule.createAuth(
            memoryAdapter({ user: [], session: [], account: [], verification: [] }),
            {
                authSecret: 'role-test-secret-that-is-longer-than-thirty-two-characters',
                authUrl: 'http://127.0.0.1',
                databaseUrl: 'memory://role-test',
                port: 3005,
                trustedOrigins: ['http://127.0.0.1'],
            },
        )

        expect(configuredAuth.options.user?.additionalFields?.role).toMatchObject({
            type: 'string',
            input: false,
            defaultValue: 'evaluator',
        })
    })

    it('rejects public email and password sign-up', async () => {
        const configuredAuth = authModule.createAuth(
            memoryAdapter({ user: [], session: [], account: [], verification: [] }),
            {
                authSecret: 'closed-signup-secret-that-is-longer-than-thirty-two-characters',
                authUrl: 'http://127.0.0.1',
                databaseUrl: 'memory://closed-signup-test',
                port: 3005,
                trustedOrigins: ['http://127.0.0.1'],
            },
        )

        const response = await configuredAuth.handler(
            new Request('http://127.0.0.1/api/auth/sign-up/email', {
                method: 'POST',
                headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1' },
                body: JSON.stringify({
                    name: 'Cuenta pública',
                    email: 'publica@example.com',
                    password: 'secure-password',
                }),
            }),
        )

        expect(response.status).toBe(400)
        expect(await response.json()).toMatchObject({
            code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED',
        })
    })
})
