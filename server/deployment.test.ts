import { existsSync, readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

describe('Vercel deployment contract', () => {
    it('provides an API function entrypoint', () => {
        expect(existsSync('api/index.ts')).toBe(true)
    })

    // `@vercel/node` compiles api/index.ts with the TypeScript it resolves from our
    // devDependencies ("Using TypeScript x.y.z (local user-provided)") and drives it through the
    // classic compiler API. TypeScript 7 ships the native port, which exposes none of these
    // members, so the builder died with "Cannot read properties of undefined (reading 'readFile')"
    // while reaching for `ts.sys.readFile`. Stay on a release that still has that surface.
    it('resolves a TypeScript the Vercel Node builder can drive', () => {
        expect(ts.sys).toBeDefined()
        expect(typeof ts.transpileModule).toBe('function')
        expect(typeof ts.createLanguageService).toBe('function')
        expect(typeof ts.createDocumentRegistry).toBe('function')
        expect(typeof ts.findConfigFile).toBe('function')
        expect(typeof ts.readConfigFile).toBe('function')
        expect(typeof ts.parseJsonConfigFileContent).toBe('function')
    })

    it('pins the TypeScript devDependency to the 5.x line', () => {
        const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
            devDependencies?: Record<string, string>
        }

        expect(manifest.devDependencies?.typescript).toMatch(/^[~^]?5\./)
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
