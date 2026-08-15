import { type FormEvent, useState } from 'react'
import { AdminRecords } from './components/AdminRecords'
import { AdminUsers } from './components/AdminUsers'
import { AssessmentForm } from './components/AssessmentForm'
import {
    type AdminAssessment,
    type AdminUser,
    createEvaluator,
    listAdminAssessments,
    listAdminUsers,
    promoteAdminUser,
    updateAdminUserPassword,
} from './lib/admin-api'
import { postAssessment } from './lib/assessment-api'
import { authClient } from './lib/auth-client'
import { prepareAuthForm } from './lib/auth-form'

type SessionData = {
    user: {
        name: string
        email: string
        role?: 'evaluator' | 'super_admin'
    }
} | null

type AuthResult = {
    error?: {
        message?: string
    } | null
}

export type AuthService = {
    useSession: () => { data: SessionData; isPending: boolean }
    signIn: (values: { email: string; password: string }) => Promise<AuthResult>
    signOut: () => Promise<unknown>
}

export type AdminService = {
    listAssessments: () => Promise<{ records: AdminAssessment[] }>
    listUsers: () => Promise<{ users: AdminUser[] }>
    createUser: (input: {
        name: string
        email: string
        password: string
    }) => Promise<{ user: AdminUser }>
    updatePassword: (userId: string, password: string) => Promise<{ success: true }>
    promoteUser: (userId: string) => Promise<{ user: AdminUser }>
}

const defaultAuthService: AuthService = {
    useSession: () => {
        const session = authClient.useSession()
        return { data: session.data, isPending: session.isPending }
    },
    signIn: (values) => authClient.signIn.email(values),
    signOut: () => authClient.signOut(),
}

const defaultAdminService: AdminService = {
    listAssessments: listAdminAssessments,
    listUsers: listAdminUsers,
    createUser: createEvaluator,
    updatePassword: updateAdminUserPassword,
    promoteUser: promoteAdminUser,
}

function Brand({ inverse = false }: { inverse?: boolean }) {
    return (
        <a
            className={`brand response-brand ${inverse ? 'inverse' : ''}`}
            href="/"
            aria-label="Respuesta Colombia, inicio"
        >
            <span className="brand-mark" aria-hidden="true">
                +
            </span>
            <span>Respuesta Colombia</span>
        </a>
    )
}

function LoadingScreen() {
    return (
        <main className="loading-screen">
            <Brand />
            <div className="loader" role="status" aria-label="Cargando el sistema de evaluación">
                <span />
                <span />
                <span />
            </div>
        </main>
    )
}

function Dashboard({
    authService,
    adminService,
    session,
}: {
    authService: AuthService
    adminService: AdminService
    session: SessionData
}) {
    const [view, setView] = useState<'assessment' | 'records' | 'users'>('assessment')
    const isSuperAdmin = session?.user.role === 'super_admin'

    return (
        <main className="response-dashboard">
            <header className="response-header">
                <Brand inverse />
                <div className="emergency-label">
                    <span /> Emergencia nacional · Sismo 10.08.2026
                </div>
                <div className="member-menu">
                    <span>{session?.user.email}</span>
                    <button
                        className="text-button"
                        type="button"
                        onClick={() => authService.signOut()}
                    >
                        Cerrar sesión
                    </button>
                </div>
            </header>
            {isSuperAdmin && (
                <nav className="admin-navigation" aria-label="Administración">
                    <button
                        className={view === 'assessment' ? 'active' : ''}
                        type="button"
                        onClick={() => setView('assessment')}
                    >
                        Nueva evaluación
                    </button>
                    <button
                        className={view === 'records' ? 'active' : ''}
                        type="button"
                        onClick={() => setView('records')}
                    >
                        Registros
                    </button>
                    <button
                        className={view === 'users' ? 'active' : ''}
                        type="button"
                        onClick={() => setView('users')}
                    >
                        Usuarios
                    </button>
                </nav>
            )}
            {view === 'assessment' && <AssessmentForm onSubmit={postAssessment} />}
            {isSuperAdmin && view === 'records' && (
                <AdminRecords loadRecords={adminService.listAssessments} />
            )}
            {isSuperAdmin && view === 'users' && (
                <AdminUsers
                    loadUsers={adminService.listUsers}
                    createUser={adminService.createUser}
                    updatePassword={adminService.updatePassword}
                    promoteUser={adminService.promoteUser}
                />
            )}
        </main>
    )
}

function AuthPanel({ authService }: { authService: AuthService }) {
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
    const [serverError, setServerError] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setServerError('')

        const form = new FormData(event.currentTarget)
        const prepared = prepareAuthForm({
            mode: 'sign-in',
            name: '',
            email: String(form.get('email') ?? ''),
            password: String(form.get('password') ?? ''),
        })

        setFieldErrors(prepared.errors)
        if (!prepared.data) return

        setIsSubmitting(true)

        try {
            const result = await authService.signIn({
                email: prepared.data.email,
                password: prepared.data.password,
            })

            if (result.error) {
                setServerError(
                    result.error.message || 'No pudimos completar la solicitud. Intentá de nuevo.',
                )
            }
        } catch {
            setServerError(
                'No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.',
            )
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <main className="auth-shell">
            <section
                className="story-panel emergency-story"
                aria-label="Respuesta al sismo en Colombia"
            >
                <div className="story-header">
                    <Brand inverse />
                    <span className="edition">Colombia · 10 agosto 2026</span>
                </div>

                <div className="story-copy">
                    <p className="eyebrow light">Evaluación de albergues temporales</p>
                    <h1>
                        Cuidar también
                        <br />
                        es <em>observar.</em>
                    </h1>
                    <p>
                        Registro de protección, género e inclusión para orientar una respuesta
                        segura, digna y oportuna en los alojamientos de emergencia.
                    </p>
                </div>

                <div className="community-note">
                    <span className="note-number">M7,4</span>
                    <p>
                        Occidente de Colombia · Información de campo para decisiones humanitarias.
                    </p>
                </div>
                <div className="sun-disc" aria-hidden="true" />
                <div className="topography" aria-hidden="true" />
            </section>

            <section className="form-panel">
                <div className="mobile-brand">
                    <Brand />
                </div>
                <div className="form-wrap">
                    <div className="form-heading">
                        <span className="form-index">01</span>
                        <div>
                            <h2>Entrá al centro de respuesta.</h2>
                            <p>Acceso para personal autorizado en terreno.</p>
                        </div>
                    </div>

                    <form onSubmit={submit} noValidate>
                        <label>
                            <span>Correo electrónico</span>
                            <input
                                name="email"
                                type="email"
                                autoComplete="email"
                                aria-invalid={Boolean(fieldErrors.email)}
                                aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                                placeholder="vos@ejemplo.com"
                            />
                            {fieldErrors.email && (
                                <small id="email-error" className="field-error">
                                    {fieldErrors.email}
                                </small>
                            )}
                        </label>

                        <label>
                            <span>Contraseña</span>
                            <input
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                aria-invalid={Boolean(fieldErrors.password)}
                                aria-describedby={
                                    fieldErrors.password ? 'password-error' : undefined
                                }
                                placeholder="Mínimo 8 caracteres"
                            />
                            {fieldErrors.password && (
                                <small id="password-error" className="field-error">
                                    {fieldErrors.password}
                                </small>
                            )}
                        </label>

                        {serverError && (
                            <p className="server-error" role="alert">
                                {serverError}
                            </p>
                        )}

                        <button className="submit-button" type="submit" disabled={isSubmitting}>
                            <span>{isSubmitting ? 'Conectando…' : 'Ingresar al sistema'}</span>
                            <span aria-hidden="true">↗</span>
                        </button>
                    </form>

                    <p className="privacy-note">
                        La información recolectada puede ser sensible. Usala únicamente para
                        coordinar la respuesta humanitaria y proteger a las personas alojadas.
                    </p>
                </div>
            </section>
        </main>
    )
}

export function App({
    authService = defaultAuthService,
    adminService = defaultAdminService,
}: {
    authService?: AuthService
    adminService?: AdminService
}) {
    const session = authService.useSession()

    if (session.isPending) return <LoadingScreen />
    if (session.data) {
        return (
            <Dashboard
                authService={authService}
                adminService={adminService}
                session={session.data}
            />
        )
    }

    return <AuthPanel authService={authService} />
}
