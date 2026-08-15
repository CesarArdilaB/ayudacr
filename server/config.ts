export type ServerConfig = {
    authSecret: string
    authUrl: string
    databaseUrl: string
    port: number
    trustedOrigins: string[]
}

type Environment = Record<string, string | undefined>

function httpsOrigin(host: string | undefined): string | undefined {
    const cleanHost = host
        ?.trim()
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '')
    return cleanHost ? `https://${cleanHost}` : undefined
}

function unique(values: Array<string | undefined>): string[] {
    return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function requireValue(environment: Environment, name: string): string {
    const value = environment[name]?.trim()

    if (!value) {
        throw new Error(`${name} is required`)
    }

    return value
}

export function readServerConfig(environment: Environment): ServerConfig {
    const authSecret = requireValue(environment, 'BETTER_AUTH_SECRET')

    if (authSecret.length < 32) {
        throw new Error('BETTER_AUTH_SECRET must be at least 32 characters')
    }

    const portValue = environment.PORT?.trim() || '3005'
    const port = Number(portValue)

    if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
        throw new Error('PORT must be a valid TCP port')
    }

    const vercelOrigins = unique([
        httpsOrigin(environment.VERCEL_PROJECT_PRODUCTION_URL),
        httpsOrigin(environment.VERCEL_URL),
    ])
    const configuredOrigins = environment.CLIENT_URL?.split(',').map((origin) => origin.trim())
    const trustedOrigins = unique([
        ...(configuredOrigins ??
            (vercelOrigins.length > 0 ? vercelOrigins : ['http://localhost:5173'])),
        ...(vercelOrigins.length > 0 ? ['https://*.vercel.app'] : []),
    ])
    const authUrl = environment.BETTER_AUTH_URL?.trim() || vercelOrigins[0]

    if (!authUrl) {
        throw new Error('BETTER_AUTH_URL is required')
    }

    return {
        authSecret,
        authUrl,
        databaseUrl: requireValue(environment, 'DATABASE_URL'),
        port,
        trustedOrigins,
    }
}
