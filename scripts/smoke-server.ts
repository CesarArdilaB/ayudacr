import { memoryAdapter } from 'better-auth/adapters/memory'
import { fromNodeHeaders } from 'better-auth/node'
import { createApp } from '../server/app.js'
import type { AssessmentRepository, SessionResolver } from '../server/assessments.js'
import { createAuth } from '../server/auth.js'

const origin = 'http://localhost:5173'
const smokeAuth = createAuth(
    memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    {
        authSecret: 'browser-smoke-secret-that-is-longer-than-thirty-two-characters',
        authUrl: origin,
        databaseUrl: 'memory://browser-smoke',
        port: 3005,
        trustedOrigins: [origin],
    },
    { allowPublicSignUp: true },
)

const sessionResolver: SessionResolver = async (headers) => {
    const session = await smokeAuth.api.getSession({ headers: fromNodeHeaders(headers) })
    return session ? { user: { id: session.user.id } } : null
}

const repository: AssessmentRepository = {
    async create(submission, userId) {
        console.log(
            `Smoke capture saved for ${userId}: ${submission.institution}, ${submission.responses.length} criteria`,
        )
        return { id: crypto.randomUUID() }
    },
}

const server = createApp({
    authInstance: smokeAuth,
    assessmentRepository: repository,
    sessionResolver,
    healthCheck: async () => undefined,
}).listen(3005, () => {
    console.log('Browser smoke API listening on http://localhost:3005')
})

function shutdown() {
    server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
