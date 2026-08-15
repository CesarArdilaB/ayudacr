import { describe, expect, it } from 'vitest'
import { prepareAuthForm } from './auth-form'

describe('prepareAuthForm', () => {
    it('normalizes a valid sign-up submission', () => {
        expect(
            prepareAuthForm({
                mode: 'sign-up',
                name: '  Ana   Solís  ',
                email: '  ANA@EXAMPLE.COM ',
                password: 'segura-123',
            }),
        ).toEqual({
            data: {
                name: 'Ana Solís',
                email: 'ana@example.com',
                password: 'segura-123',
            },
            errors: {},
        })
    })

    it('does not require a name when signing in', () => {
        expect(
            prepareAuthForm({
                mode: 'sign-in',
                name: '',
                email: 'ana@example.com',
                password: 'segura-123',
            }),
        ).toEqual({
            data: {
                email: 'ana@example.com',
                password: 'segura-123',
            },
            errors: {},
        })
    })

    it('returns field errors for invalid sign-up values', () => {
        expect(
            prepareAuthForm({
                mode: 'sign-up',
                name: ' ',
                email: 'not-an-email',
                password: 'short',
            }),
        ).toEqual({
            data: null,
            errors: {
                name: 'Escribe tu nombre.',
                email: 'Escribe un correo válido.',
                password: 'Usa al menos 8 caracteres.',
            },
        })
    })
})
