import { type FormEvent, useCallback, useEffect, useState } from 'react'
import type { AdminUser, NewEvaluator } from '../lib/admin-api.js'

type Message = { kind: 'success' | 'error'; text: string }

export function AdminUsers({
    loadUsers,
    createUser,
    updatePassword,
    promoteUser,
}: {
    loadUsers: () => Promise<{ users: AdminUser[] }>
    createUser: (input: NewEvaluator) => Promise<{ user: AdminUser }>
    updatePassword: (userId: string, password: string) => Promise<{ success: true }>
    promoteUser: (userId: string) => Promise<{ user: AdminUser }>
}) {
    const [users, setUsers] = useState<AdminUser[]>([])
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
    const [message, setMessage] = useState<Message>()
    const [busyAction, setBusyAction] = useState('')
    const [passwordUserId, setPasswordUserId] = useState('')

    const refresh = useCallback(async () => {
        try {
            const result = await loadUsers()
            setUsers(result.users)
            setStatus('ready')
        } catch {
            setStatus('error')
        }
    }, [loadUsers])

    useEffect(() => {
        void refresh()
    }, [refresh])

    async function submitNewUser(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const form = event.currentTarget
        const values = new FormData(form)
        const input = {
            name: String(values.get('name') ?? '')
                .trim()
                .replace(/\s+/g, ' '),
            email: String(values.get('email') ?? '')
                .trim()
                .toLowerCase(),
            password: String(values.get('password') ?? ''),
        }
        setBusyAction('create')
        setMessage(undefined)
        try {
            const result = await createUser(input)
            form.reset()
            setUsers((current) => [result.user, ...current])
            setMessage({ kind: 'success', text: `Acceso creado para ${input.email}.` })
        } catch (error) {
            setMessage({
                kind: 'error',
                text: error instanceof Error ? error.message : 'No fue posible crear el acceso.',
            })
        } finally {
            setBusyAction('')
        }
    }

    async function submitPassword(event: FormEvent<HTMLFormElement>, target: AdminUser) {
        event.preventDefault()
        const password = String(new FormData(event.currentTarget).get('password') ?? '')
        setBusyAction(`password:${target.id}`)
        setMessage(undefined)
        try {
            await updatePassword(target.id, password)
            setPasswordUserId('')
            setMessage({ kind: 'success', text: `Contraseña actualizada para ${target.email}.` })
        } catch (error) {
            setMessage({
                kind: 'error',
                text: error instanceof Error ? error.message : 'No fue posible actualizarla.',
            })
        } finally {
            setBusyAction('')
        }
    }

    async function promote(target: AdminUser) {
        const confirmed = window.confirm(
            `¿Promover a ${target.email} a super admin? Tendrá acceso total a usuarios y registros.`,
        )
        if (!confirmed) return

        setBusyAction(`promote:${target.id}`)
        setMessage(undefined)
        try {
            const result = await promoteUser(target.id)
            setUsers((current) =>
                current.map((record) => (record.id === target.id ? result.user : record)),
            )
            setMessage({ kind: 'success', text: `${target.email} ahora es super admin.` })
        } catch (error) {
            setMessage({
                kind: 'error',
                text: error instanceof Error ? error.message : 'No fue posible promover la cuenta.',
            })
        } finally {
            setBusyAction('')
        }
    }

    return (
        <section className="admin-surface user-admin-surface" aria-labelledby="users-title">
            <div className="admin-title-row">
                <div>
                    <p className="eyebrow">Gestión del equipo</p>
                    <h1 id="users-title">Gestión de usuarios</h1>
                    <p>Creá accesos, actualizá contraseñas y asigná permisos administrativos.</p>
                </div>
                <span className="admin-seal">Solo super admin</span>
            </div>

            <form className="admin-user-form" onSubmit={submitNewUser}>
                <label>
                    <span>Nombre del evaluador</span>
                    <input name="name" autoComplete="name" required />
                </label>
                <label>
                    <span>Correo del evaluador</span>
                    <input name="email" type="email" autoComplete="email" required />
                </label>
                <label>
                    <span>Contraseña temporal</span>
                    <input
                        aria-label="Contraseña temporal"
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={128}
                        required
                    />
                    <small>Mínimo 8 caracteres. Compartila por un canal seguro.</small>
                </label>
                <button
                    className="assessment-primary"
                    type="submit"
                    disabled={status !== 'ready' || Boolean(busyAction)}
                >
                    {busyAction === 'create' ? 'Creando acceso…' : 'Crear acceso'}{' '}
                    <span aria-hidden="true">→</span>
                </button>
            </form>

            {message && (
                <p
                    className={message.kind === 'error' ? 'server-error' : 'admin-success'}
                    role={message.kind === 'error' ? 'alert' : 'status'}
                >
                    {message.text}
                </p>
            )}

            <div className="users-list-heading">
                <h2>Usuarios creados</h2>
                <span>{users.length} cuentas</span>
            </div>
            {status === 'loading' && <p role="status">Cargando usuarios…</p>}
            {status === 'error' && (
                <p className="server-error" role="alert">
                    No fue posible cargar los usuarios.
                </p>
            )}
            {status === 'ready' && (
                <div className="records-table-wrap users-table-wrap">
                    <table className="records-table users-table">
                        <thead>
                            <tr>
                                <th>Usuario</th>
                                <th>Rol</th>
                                <th>Creado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((record) => (
                                <tr key={record.id}>
                                    <td data-label="Usuario">
                                        <strong>{record.name}</strong>
                                        <span>{record.email}</span>
                                    </td>
                                    <td data-label="Rol">
                                        <span className={`role-badge ${record.role}`}>
                                            {record.role === 'super_admin'
                                                ? 'Super admin'
                                                : 'Evaluador'}
                                        </span>
                                    </td>
                                    <td data-label="Creado">
                                        {new Intl.DateTimeFormat('es-CO').format(
                                            new Date(record.createdAt),
                                        )}
                                    </td>
                                    <td data-label="Acciones">
                                        <div className="user-actions">
                                            <button
                                                type="button"
                                                className="table-action"
                                                aria-label={`Cambiar contraseña de ${record.email}`}
                                                onClick={() =>
                                                    setPasswordUserId((current) =>
                                                        current === record.id ? '' : record.id,
                                                    )
                                                }
                                            >
                                                Contraseña
                                            </button>
                                            {record.role !== 'super_admin' && (
                                                <button
                                                    type="button"
                                                    className="table-action promote-action"
                                                    aria-label={`Promover a super admin a ${record.email}`}
                                                    disabled={Boolean(busyAction)}
                                                    onClick={() => void promote(record)}
                                                >
                                                    {busyAction === `promote:${record.id}`
                                                        ? 'Promoviendo…'
                                                        : 'Promover'}
                                                </button>
                                            )}
                                        </div>
                                        {passwordUserId === record.id && (
                                            <form
                                                className="password-update-form"
                                                onSubmit={(event) => submitPassword(event, record)}
                                            >
                                                <label>
                                                    <span className="sr-only">
                                                        Nueva contraseña para {record.email}
                                                    </span>
                                                    <input
                                                        aria-label={`Nueva contraseña para ${record.email}`}
                                                        name="password"
                                                        type="password"
                                                        autoComplete="new-password"
                                                        minLength={8}
                                                        maxLength={128}
                                                        placeholder="Nueva contraseña"
                                                        required
                                                    />
                                                </label>
                                                <button
                                                    type="submit"
                                                    aria-label={`Guardar contraseña de ${record.email}`}
                                                    disabled={Boolean(busyAction)}
                                                >
                                                    Guardar
                                                </button>
                                            </form>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    )
}
