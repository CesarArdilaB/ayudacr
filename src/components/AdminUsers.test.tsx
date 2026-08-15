import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AdminUser } from '../lib/admin-api.js'
import { AdminUsers } from './AdminUsers.js'

const evaluator: AdminUser = {
    id: 'user-1',
    name: 'Ana Torres',
    email: 'ana@example.com',
    role: 'evaluator',
    createdAt: '2026-08-15T20:00:00.000Z',
}

function services() {
    return {
        loadUsers: vi.fn().mockResolvedValue({ users: [evaluator] }),
        createUser: vi.fn().mockResolvedValue({
            user: { ...evaluator, id: 'user-2', name: 'Luis Campo', email: 'luis@example.com' },
        }),
        updatePassword: vi.fn().mockResolvedValue({ success: true as const }),
        promoteUser: vi.fn().mockResolvedValue({
            user: { ...evaluator, role: 'super_admin' as const },
        }),
    }
}

describe('AdminUsers', () => {
    it('loads and displays created users', async () => {
        const props = services()
        render(<AdminUsers {...props} />)

        expect(await screen.findByText('Ana Torres')).toBeInTheDocument()
        expect(screen.getByText('ana@example.com')).toBeInTheDocument()
        expect(screen.getByText('Evaluador')).toBeInTheDocument()
        expect(props.loadUsers).toHaveBeenCalledOnce()
    })

    it('creates an evaluator and adds it without a racing reload', async () => {
        const user = userEvent.setup()
        const props = services()
        render(<AdminUsers {...props} />)

        await screen.findByText('Ana Torres')
        await user.type(screen.getByLabelText('Nombre del evaluador'), '  Luis Campo  ')
        await user.type(screen.getByLabelText('Correo del evaluador'), ' LUIS@EXAMPLE.COM ')
        await user.type(screen.getByLabelText('Contraseña temporal'), 'segura-123')
        await user.click(screen.getByRole('button', { name: 'Crear acceso' }))

        expect(props.createUser).toHaveBeenCalledWith({
            name: 'Luis Campo',
            email: 'luis@example.com',
            password: 'segura-123',
        })
        expect(await screen.findByText('luis@example.com')).toBeInTheDocument()
        expect(props.loadUsers).toHaveBeenCalledOnce()
    })

    it('updates a selected user password', async () => {
        const user = userEvent.setup()
        const props = services()
        render(<AdminUsers {...props} />)

        await screen.findByText('Ana Torres')
        await user.click(
            screen.getByRole('button', { name: 'Cambiar contraseña de ana@example.com' }),
        )
        await user.type(
            screen.getByLabelText('Nueva contraseña para ana@example.com'),
            'nueva-segura-456',
        )
        await user.click(
            screen.getByRole('button', { name: 'Guardar contraseña de ana@example.com' }),
        )

        expect(props.updatePassword).toHaveBeenCalledWith('user-1', 'nueva-segura-456')
        expect(await screen.findByRole('status')).toHaveTextContent('Contraseña actualizada')
    })

    it('promotes an evaluator after confirmation without a racing reload', async () => {
        const user = userEvent.setup()
        const props = services()
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        render(<AdminUsers {...props} />)

        await screen.findByText('Ana Torres')
        await user.click(
            screen.getByRole('button', { name: 'Promover a super admin a ana@example.com' }),
        )

        expect(props.promoteUser).toHaveBeenCalledWith('user-1')
        expect(await screen.findByText('Super admin')).toBeInTheDocument()
        expect(props.loadUsers).toHaveBeenCalledOnce()
        expect(window.confirm).toHaveBeenCalledWith(
            '¿Promover a ana@example.com a super admin? Tendrá acceso total a usuarios y registros.',
        )
    })

    it('cancels promotion when the super admin does not confirm', async () => {
        const user = userEvent.setup()
        const props = services()
        vi.spyOn(window, 'confirm').mockReturnValue(false)
        render(<AdminUsers {...props} />)

        await screen.findByText('Ana Torres')
        await user.click(
            screen.getByRole('button', { name: 'Promover a super admin a ana@example.com' }),
        )

        expect(props.promoteUser).not.toHaveBeenCalled()
    })
})
