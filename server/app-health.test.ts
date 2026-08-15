import type { Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
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
})
