import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentType } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { App, type AuthService } from './App'

function createAuthService(overrides: Partial<AuthService> = {}): AuthService {
    return {
        useSession: () => ({ data: null, isPending: false }),
        signIn: vi.fn().mockResolvedValue({}),
        signUp: vi.fn().mockResolvedValue({}),
        signOut: vi.fn().mockResolvedValue({}),
        ...overrides,
    }
}

type TestAdminService = {
    listAssessments: () => Promise<{
        records: Array<{
            id: string
            institution: string
            visitDate: string
            municipality: string
            department: string
            createdAt: string
            createdBy: { name: string; email: string }
            responseCount: number
        }>
    }>
}

const AdminConfigurableApp = App as unknown as ComponentType<{
    authService: AuthService
    adminService: TestAdminService
}>

describe('App', () => {
    it('shows the sign-in journey to a signed-out visitor', () => {
        render(<App authService={createAuthService()} />)

        expect(
            screen.getByRole('heading', { name: 'Entrá al centro de respuesta.' }),
        ).toBeInTheDocument()
        expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Ingresar al sistema' })).toBeInTheDocument()
    })

    it('switches to account creation and submits normalized values', async () => {
        const user = userEvent.setup()
        const signUp = vi.fn().mockResolvedValue({})
        const authService = createAuthService({ signUp })

        render(<App authService={authService} />)

        await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))
        await user.type(screen.getByLabelText('Nombre'), '  Ana Solís  ')
        await user.type(screen.getByLabelText('Correo electrónico'), 'ANA@EXAMPLE.COM')
        await user.type(screen.getByLabelText('Contraseña'), 'segura-123')
        await user.click(screen.getByRole('button', { name: 'Crear perfil de evaluación' }))

        expect(signUp).toHaveBeenCalledWith({
            name: 'Ana Solís',
            email: 'ana@example.com',
            password: 'segura-123',
        })
    })

    it('shows the protected shelter assessment and signs the member out', async () => {
        const user = userEvent.setup()
        const signOut = vi.fn().mockResolvedValue({})
        const authService = createAuthService({
            useSession: () => ({
                data: { user: { name: 'Ana Solís', email: 'ana@example.com' } },
                isPending: false,
            }),
            signOut,
        })

        render(<App authService={authService} />)

        expect(
            screen.getByRole('heading', { name: 'Información del alojamiento' }),
        ).toBeInTheDocument()
        expect(screen.getByText('ana@example.com')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
        expect(signOut).toHaveBeenCalledOnce()
    })

    it('announces an authentication error returned by the server', async () => {
        const user = userEvent.setup()
        const authService = createAuthService({
            signIn: vi.fn().mockResolvedValue({
                error: { message: 'Correo o contraseña incorrectos.' },
            }),
        })

        render(<App authService={authService} />)

        await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
        await user.type(screen.getByLabelText('Contraseña'), 'incorrecta')
        await user.click(screen.getByRole('button', { name: 'Ingresar al sistema' }))

        expect(screen.getByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.')
    })

    it('does not expose administration controls to an evaluator', () => {
        const authService = createAuthService({
            useSession: () => ({
                data: {
                    user: {
                        name: 'Ana Solís',
                        email: 'ana@example.com',
                        role: 'evaluator',
                    },
                } as never,
                isPending: false,
            }),
        })

        render(<App authService={authService} />)

        expect(screen.queryByRole('button', { name: 'Registros' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Crear usuarios' })).not.toBeInTheDocument()
    })

    it('lets a super admin review captured records', async () => {
        const user = userEvent.setup()
        const listAssessments = vi.fn().mockResolvedValue({
            records: [
                {
                    id: 'assessment-1',
                    institution: 'Coliseo Central',
                    visitDate: '2026-08-15',
                    municipality: 'Pereira',
                    department: 'Risaralda',
                    createdAt: '2026-08-15T20:00:00.000Z',
                    createdBy: { name: 'Ana Torres', email: 'ana@example.com' },
                    responseCount: 44,
                },
            ],
        })
        const authService = createAuthService({
            useSession: () => ({
                data: {
                    user: {
                        name: 'Super Admin',
                        email: 'admin@example.com',
                        role: 'super_admin',
                    },
                } as never,
                isPending: false,
            }),
        })

        render(
            <AdminConfigurableApp authService={authService} adminService={{ listAssessments }} />,
        )
        await user.click(screen.getByRole('button', { name: 'Registros' }))

        expect(await screen.findByRole('cell', { name: /Coliseo Central/ })).toBeInTheDocument()
        expect(screen.getByRole('cell', { name: /Ana Torres/ })).toBeInTheDocument()
        expect(screen.getByText('44 / 44')).toBeInTheDocument()
        expect(listAssessments).toHaveBeenCalledOnce()
    })

    it('does not expose user creation controls to a super admin', () => {
        const authService = createAuthService({
            useSession: () => ({
                data: {
                    user: {
                        name: 'Super Admin',
                        email: 'admin@example.com',
                        role: 'super_admin',
                    },
                } as never,
                isPending: false,
            }),
        })

        render(
            <AdminConfigurableApp
                authService={authService}
                adminService={{ listAssessments: vi.fn() }}
            />,
        )

        expect(screen.queryByRole('button', { name: 'Crear usuarios' })).not.toBeInTheDocument()
        expect(
            screen.queryByRole('heading', { name: 'Crear acceso de evaluador' }),
        ).not.toBeInTheDocument()
    })
})
