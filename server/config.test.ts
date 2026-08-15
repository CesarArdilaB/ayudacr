import { describe, expect, it } from 'vitest'
import { readServerConfig } from './config.js'

const validEnvironment = {
    BETTER_AUTH_SECRET: 'a-secret-that-is-at-least-thirty-two-characters-long',
    BETTER_AUTH_URL: 'http://localhost:3001',
    DATABASE_URL: 'postgresql://user:password@host/database?sslmode=require',
}

describe('readServerConfig', () => {
    it('returns validated server settings and trusted origins', () => {
        expect(
            readServerConfig({
                ...validEnvironment,
                CLIENT_URL: 'http://localhost:5173, https://ayuda.example',
                PORT: '4040',
            }),
        ).toEqual({
            authSecret: validEnvironment.BETTER_AUTH_SECRET,
            authUrl: 'http://localhost:3001',
            databaseUrl: validEnvironment.DATABASE_URL,
            port: 4040,
            trustedOrigins: ['http://localhost:5173', 'https://ayuda.example'],
        })
    })

    it.each(['DATABASE_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL'] as const)(
        'throws an actionable error when %s is missing',
        (name) => {
            const environment = { ...validEnvironment }
            delete environment[name]

            expect(() => readServerConfig(environment)).toThrow(`${name} is required`)
        },
    )

    it('rejects secrets shorter than 32 characters', () => {
        expect(() =>
            readServerConfig({ ...validEnvironment, BETTER_AUTH_SECRET: 'too-short' }),
        ).toThrow('BETTER_AUTH_SECRET must be at least 32 characters')
    })

    it('uses development defaults for the port and client origin', () => {
        expect(readServerConfig(validEnvironment)).toMatchObject({
            port: 3005,
            trustedOrigins: ['http://localhost:5173'],
        })
    })

    it('derives same-origin auth settings for a Vercel deployment', () => {
        expect(
            readServerConfig({
                BETTER_AUTH_SECRET: validEnvironment.BETTER_AUTH_SECRET,
                DATABASE_URL: validEnvironment.DATABASE_URL,
                VERCEL_URL: 'respuesta-colombia-git-main.vercel.app',
            }),
        ).toMatchObject({
            authUrl: 'https://respuesta-colombia-git-main.vercel.app',
            trustedOrigins: [
                'https://respuesta-colombia-git-main.vercel.app',
                'https://*.vercel.app',
            ],
        })
    })

    it('prefers the configured production domain over a preview hostname', () => {
        expect(
            readServerConfig({
                BETTER_AUTH_SECRET: validEnvironment.BETTER_AUTH_SECRET,
                DATABASE_URL: validEnvironment.DATABASE_URL,
                VERCEL_PROJECT_PRODUCTION_URL: 'respuesta-colombia.vercel.app',
                VERCEL_URL: 'respuesta-colombia-abc123.vercel.app',
            }),
        ).toMatchObject({
            authUrl: 'https://respuesta-colombia.vercel.app',
            trustedOrigins: [
                'https://respuesta-colombia.vercel.app',
                'https://respuesta-colombia-abc123.vercel.app',
                'https://*.vercel.app',
            ],
        })
    })
})
