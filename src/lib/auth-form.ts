export type AuthMode = 'sign-in' | 'sign-up'

export type AuthFormValues = {
    mode: AuthMode
    name: string
    email: string
    password: string
}

type FieldErrors = Partial<Record<'name' | 'email' | 'password', string>>

type PreparedAuthData = {
    name?: string
    email: string
    password: string
}

type PreparedAuthForm =
    | { data: PreparedAuthData; errors: Record<string, never> }
    | { data: null; errors: FieldErrors }

export function prepareAuthForm(values: AuthFormValues): PreparedAuthForm {
    const name = values.name.trim().replace(/\s+/g, ' ')
    const email = values.email.trim().toLowerCase()
    const errors: FieldErrors = {}

    if (values.mode === 'sign-up' && !name) {
        errors.name = 'Escribe tu nombre.'
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.email = 'Escribe un correo válido.'
    }

    if (values.password.length < 8) {
        errors.password = 'Usa al menos 8 caracteres.'
    }

    if (Object.keys(errors).length > 0) {
        return { data: null, errors }
    }

    return {
        data: {
            ...(values.mode === 'sign-up' ? { name } : {}),
            email,
            password: values.password,
        },
        errors: {},
    }
}
