import { getTableColumns, getTableName } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as schema from './schema.js'

describe('production database schema', () => {
    it('includes every Better Auth core table in Drizzle migrations', () => {
        const authTables = ['user', 'session', 'account', 'verification']
        const exportedTables = [
            (schema as Record<string, unknown>).user,
            (schema as Record<string, unknown>).session,
            (schema as Record<string, unknown>).account,
            (schema as Record<string, unknown>).verification,
        ]

        expect(exportedTables.every(Boolean)).toBe(true)
        expect(
            exportedTables.map((table) =>
                getTableName(table as Parameters<typeof getTableName>[0]),
            ),
        ).toEqual(authTables)
    })

    it('stores a least-privilege role for every user', () => {
        const columns = getTableColumns(schema.user)

        expect(columns).toHaveProperty('role')
        expect(columns.role.notNull).toBe(true)
        expect(columns.role.default).toBe('evaluator')
    })
})
