import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { toNodeHandler } from 'better-auth/node'
import cors from 'cors'
import express from 'express'
import { createAdminRouter } from './admin.js'
import {
    type AssessmentRepository,
    createAssessmentsRouter,
    type SessionResolver,
} from './assessments.js'
import { auth, databasePool, serverConfig } from './auth.js'

type AuthInstance = Parameters<typeof toNodeHandler>[0]

export function createApp({
    authInstance = auth,
    assessmentRepository,
    sessionResolver,
    healthCheck = async () => {
        await databasePool.query('select 1 from "user", "shelter_assessments" limit 0')
    },
}: {
    authInstance?: AuthInstance
    assessmentRepository?: AssessmentRepository
    sessionResolver?: SessionResolver
    healthCheck?: () => Promise<void>
} = {}) {
    const app = express()

    app.use(
        cors({
            credentials: true,
            origin: serverConfig.trustedOrigins,
        }),
    )

    app.all('/api/auth/*splat', toNodeHandler(authInstance))

    app.use(express.json())
    app.use('/api/admin', createAdminRouter())
    app.use(
        '/api/assessments',
        createAssessmentsRouter({ repository: assessmentRepository, sessionResolver }),
    )
    app.get('/api/health', async (_request, response) => {
        try {
            await healthCheck()
            response.json({ status: 'ok', checks: { database: 'ok' } })
        } catch {
            response.status(503).json({
                status: 'error',
                checks: { database: 'unavailable' },
            })
        }
    })

    if (process.env.NODE_ENV === 'production') {
        const serverDirectory = path.dirname(fileURLToPath(import.meta.url))
        const clientDirectory = path.resolve(serverDirectory, '../dist')

        app.use(express.static(clientDirectory))
        app.get('/*splat', (_request, response) => {
            response.sendFile(path.join(clientDirectory, 'index.html'))
        })
    }

    return app
}
