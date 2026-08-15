import { createApp } from './app.js'
import { databasePool, serverConfig } from './auth.js'

const server = createApp().listen(serverConfig.port, () => {
    console.log(`Respuesta Colombia API listening on http://localhost:${serverConfig.port}`)
})

function shutdown(signal: string) {
    console.log(`Received ${signal}; shutting down`)
    server.close(() => {
        void databasePool.end().finally(() => process.exit(0))
    })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
