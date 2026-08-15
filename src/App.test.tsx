import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { type AdminService, App, type AuthService } from './App'

function createAuthService(overrides: Partial<AuthService> = {}): AuthService {
    return {
        useSession: () => ({ data: null, isPending: false }),
        signIn: vi.fn().mockResolvedValue({}),
        signOut: vi.fn().mockResolvedValue({}),
        ...overrides,
    }
}

function createAdminService(overrides: Partial<AdminService> = {}): AdminService {
    return {
        listAssessments: vi.fn().mockResolvedValue({ records: [] }),
        listUsers: vi.fn().mockResolvedValue({ users: [] }),
        createUser: vi.fn(),
        updatePassword: vi.fn(),
        promoteUser: vi.fn(),
        ...overrides,
    }
}

describe('App', () => {
    it('shows the sign-in journey to a signed-out visitor', () => {
        render(<App authService={createAuthService()} />)

        expect(
            screen.getByRole('heading', { name: 'Entrá al centro de respuesta.' }),
        ).toBeInTheDocument()
        expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Ingresar al sistema' })).toBeInTheDocument()
    })

    it('does not offer public account creation', () => {
        render(<App authService={createAuthService()} />)

        expect(screen.queryByRole('button', { name: 'Crear cuenta' })).not.toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: 'Crear perfil de evaluación' }),
        ).not.toBeInTheDocument()
        expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
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
            <App
                authService={authService}
                adminService={createAdminService({ listAssessments })}
            />,
        )
        await user.click(screen.getByRole('button', { name: 'Registros' }))

        expect(await screen.findByRole('cell', { name: /Coliseo Central/ })).toBeInTheDocument()
        expect(screen.getByRole('cell', { name: /Ana Torres/ })).toBeInTheDocument()
        expect(screen.getByText('44 / 44')).toBeInTheDocument()
        expect(listAssessments).toHaveBeenCalledOnce()
    })

    it('gives a super admin access to user management', async () => {
        const user = userEvent.setup()
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

        render(<App authService={authService} adminService={createAdminService()} />)

        await user.click(screen.getByRole('button', { name: 'Usuarios' }))

        expect(screen.getByRole('heading', { name: 'Gestión de usuarios' })).toBeInTheDocument()
    })
})
