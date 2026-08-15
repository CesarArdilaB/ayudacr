import { type FormEvent, useState } from 'react'
import type { NewEvaluator } from '../lib/admin-api.js'

export function AdminUsers({
    createUser,
}: {
    createUser: (
        input: NewEvaluator,
    ) => Promise<{ user: { id: string; name: string; email: string } }>
}) {
    const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string }>()
    const [isSubmitting, setIsSubmitting] = useState(false)

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const form = event.currentTarget
        const data = new FormData(form)
        const input = {
            name: String(data.get('name') ?? '')
                .trim()
                .replace(/\s+/g, ' '),
            email: String(data.get('email') ?? '')
                .trim()
                .toLowerCase(),
            password: String(data.get('password') ?? ''),
        }

        setIsSubmitting(true)
        setMessage(undefined)
        try {
            const result = await createUser(input)
            setMessage({
                kind: 'success',
                text: `Acceso creado para ${result.user.email}`,
            })
            form.reset()
        } catch (error) {
            setMessage({
                kind: 'error',
                text: error instanceof Error ? error.message : 'No fue posible crear el acceso.',
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <section className="admin-surface user-admin-surface" aria-labelledby="users-title">
            <div className="admin-title-row">
                <div>
                    <p className="eyebrow">Gestión del equipo</p>
                    <h1 id="users-title">Crear acceso de evaluador</h1>
                    <p>La nueva cuenta podrá iniciar sesión y registrar visitas a albergues.</p>
                </div>
                <span className="admin-seal">Solo super admin</span>
            </div>

            <form className="admin-user-form" onSubmit={submit}>
                <label>
                    <span>Nombre del evaluador</span>
                    <input name="name" type="text" autoComplete="name" required />
                </label>
                <label>
                    <span>Correo del evaluador</span>
                    <input name="email" type="email" autoComplete="email" required />
                </label>
                <label>
                    <span>Contraseña temporal</span>
                    <input
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        required
                    />
                    <small>Mínimo 8 caracteres. Compartila por un canal seguro.</small>
                </label>
                {message && (
                    <p
                        className={message.kind === 'error' ? 'server-error' : 'admin-success'}
                        role={message.kind === 'error' ? 'alert' : 'status'}
                    >
                        {message.text}
                    </p>
                )}
                <button className="assessment-primary" type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Creando acceso…' : 'Crear acceso'}
                    <span aria-hidden="true">→</span>
                </button>
            </form>
        </section>
    )
}
