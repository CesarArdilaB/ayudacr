import { describe, expect, it } from 'vitest'
import {
    COLOMBIA_DEPARTMENTS,
    COLOMBIA_LOCATIONS,
    municipalitiesForDepartment,
} from './colombia-locations.js'

describe('Colombia DIVIPOLA catalog', () => {
    it('contains every department and territorial municipality from the DANE 2024 layer', () => {
        const municipalityCount = Object.values(COLOMBIA_LOCATIONS).reduce(
            (total, municipalities) => total + municipalities.length,
            0,
        )

        expect(COLOMBIA_DEPARTMENTS).toHaveLength(33)
        expect(municipalityCount).toBe(1121)
    })

    it('maps municipalities to their departments', () => {
        expect(municipalitiesForDepartment('ANTIOQUIA')).toContain('MEDELLÍN')
        expect(municipalitiesForDepartment('VALLE DEL CAUCA')).toContain('CALI')
        expect(municipalitiesForDepartment('VALLE DEL CAUCA')).not.toContain('MEDELLÍN')
    })
})
