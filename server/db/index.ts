import { drizzle } from 'drizzle-orm/node-postgres'
import { databasePool } from '../auth.js'
import * as schema from './schema.js'

export const db = drizzle({ client: databasePool, schema })
