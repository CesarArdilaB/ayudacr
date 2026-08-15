import 'dotenv/config'
import { attachDatabasePool } from '@vercel/functions'
import { betterAuth } from 'better-auth'
import { Pool } from 'pg'
import { readServerConfig } from './config.js'

export const serverConfig = readServerConfig(process.env)

export const databasePool = new Pool({
    connectionString: serverConfig.databaseUrl,
    max: 10,
})
attachDatabasePool(databasePool)

type AuthDatabase = NonNullable<Parameters<typeof betterAuth>[0]>['database']

function authBaseURL(config: typeof serverConfig) {
    if (!config.trustedOrigins.some((origin) => origin.includes('*'))) {
        return config.authUrl
    }

    return {
        allowedHosts: config.trustedOrigins.map((origin) =>
            origin.replace(/^https?:\/\//, '').replace(/\/$/, ''),
        ),
        fallback: config.authUrl,
        protocol: 'https' as const,
    }
}

export function createAuth(database: AuthDatabase, config = serverConfig) {
    return betterAuth({
        appName: 'Respuesta Colombia',
        baseURL: authBaseURL(config),
        secret: config.authSecret,
        database,
        trustedOrigins: config.trustedOrigins,
        emailAndPassword: {
            enabled: true,
            minPasswordLength: 8,
        },
        user: {
            additionalFields: {
                role: {
                    type: 'string',
                    input: false,
                    defaultValue: 'evaluator',
                },
            },
        },
        session: {
            expiresIn: 60 * 60 * 24 * 7,
            updateAge: 60 * 60 * 24,
        },
    })
}

export const auth = createAuth(databasePool)
