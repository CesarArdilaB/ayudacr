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
})
