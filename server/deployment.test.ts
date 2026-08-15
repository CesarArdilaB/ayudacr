import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Vercel deployment contract', () => {
    it('provides an API function entrypoint', () => {
        expect(existsSync('api/index.ts')).toBe(true)
    })

    it('builds the Vite SPA and preserves API routes before the SPA fallback', () => {
        expect(existsSync('vercel.json')).toBe(true)

        const configuration = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
            outputDirectory?: string
            rewrites?: Array<{ source: string; destination: string }>
        }

        expect(configuration.outputDirectory).toBe('dist')
        expect(configuration.rewrites).toEqual([
            { source: '/api/(.*)', destination: '/api/index' },
            { source: '/(.*)', destination: '/index.html' },
        ])
    })
})
