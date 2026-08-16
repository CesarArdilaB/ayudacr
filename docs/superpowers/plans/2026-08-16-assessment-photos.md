# Evidencias fotográficas de evaluaciones Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que una persona evaluadora adjunte hasta cuatro fotografías al final del formulario y guardarlas atómicamente con la evaluación.

**Architecture:** El navegador reprocesa todas las imágenes secuencialmente a JPEG para eliminar EXIF/GPS, limita cada salida a 300 KiB y la convierte a Base64. El mismo POST de evaluación incluye hasta cuatro evidencias para que la evaluación y sus fotos se inserten en una sola transacción; el máximo serializado queda holgadamente debajo de 4 MB de Express y 4,5 MB de Vercel. PostgreSQL almacena los bytes en una tabla hija con borrado en cascada; el servidor decodifica Base64 estrictamente, verifica la firma JPEG y calcula el tamaño real.

**Tech Stack:** React 19, TypeScript, Canvas API, Express, Drizzle ORM, PostgreSQL, Vitest, Vercel.

---

## Chunk 1: Contrato, persistencia e interfaz

### Task 1: Contrato y validación de fotografías

**Files:**
- Create: `shared/assessment-photos.ts`
- Modify: `shared/assessment.ts`
- Test: `shared/assessment.test.ts`

- [ ] Agregar una prueba fallida que acepte una foto JPEG válida y la normalice.
- [ ] Agregar pruebas fallidas para más de cuatro fotos, MIME no permitido, Base64 no canónico, datos vacíos/truncados, firma binaria discordante y foto mayor a 300 KiB.
- [ ] Agregar una prueba que mida el `JSON.stringify` del caso máximo y exija margen debajo de 4 MB/4,5 MB.
- [ ] Agregar límites y pruebas para todos los textos: institución 200, ubicación 100, contacto/cargo/visitante 120, teléfono 40, correo 254, notas generales 5.000, comentario por criterio 2.000; máximo 20 visitantes. El presupuesto máximo debe construir todos estos campos a su límite.
- [ ] Ejecutar `npx vitest run shared/assessment.test.ts` y confirmar fallos por funcionalidad ausente.
- [ ] Implementar constantes, tipos y validación mínima; los envíos antiguos sin `photos` deben producir `photos: []`.
- [ ] Ejecutar la prueba enfocada y confirmar que pasa.

### Task 2: Tabla hija y guardado transaccional

**Files:**
- Modify: `server/db/schema.ts`
- Modify: `server/assessments.ts`
- Modify: `server/app.ts`
- Modify: `server/app-health.test.ts`
- Modify: `server/assessments.test.ts`
- Modify: `server/journey.integration.test.ts`
- Create: `server/assessments.postgres.test.ts`
- Create: `drizzle/0004_*.sql` y snapshot Drizzle generado

- [ ] Agregar una prueba fallida que demuestre que el repositorio recibe fotos validadas y que el recorrido sin fotos sigue funcionando.
- [ ] Definir `assessment_photos` con UUID, `assessment_id` con cascada, posición, MIME, tamaño calculado, `bytea`, timestamps, índice, unicidad por posición y checks de tamaño.
- [ ] Insertar evaluación, respuestas y fotos dentro de la transacción existente.
- [ ] Montar `/api/assessments` con `express.json({ limit: '4mb' })` antes del parser JSON general, manteniendo Better Auth primero; añadir un handler JSON de `PayloadTooLargeError`.
- [ ] Probar mediante `createApp` que un payload válido mayor a 100 KB llega al router y que uno mayor a 4 MB recibe 413 JSON.
- [ ] Añadir una prueba obligatoria del repositorio real sobre PostgreSQL desechable con PGlite: commit completo, rollback forzado cuando falla la foto y borrado en cascada. Aplicar las migraciones reales en una base temporal por prueba.
- [ ] Generar con `npm run db:generate`; revisar que el SQL solo cree la tabla, FK, índice, unicidad y checks esperados (`position` 0–3, MIME JPEG, tamaño igual a `octet_length(data)` y 1–307.200 bytes).
- [ ] Ejecutar pruebas enfocadas.

### Task 3: Preparación y experiencia móvil

**Files:**
- Create: `src/lib/assessment-photos.ts`
- Create: `src/lib/assessment-photos.test.ts`
- Modify: `src/lib/assessment-api.ts`
- Modify: `src/lib/assessment-api.test.ts`
- Modify: `src/components/AssessmentForm.tsx`
- Modify: `src/components/AssessmentForm.test.tsx`
- Modify: `src/styles.css`

- [ ] Agregar pruebas fallidas para reprocesamiento de una imagen pequeña (sin conservar bytes/EXIF), rechazo de formato, archivo de entrada mayor a 15 MiB y límite de cuatro adjuntos.
- [ ] Agregar una prueba fallida del formulario que selecciona una foto, muestra previsualización, permite eliminarla y la incluye al guardar.
- [ ] Implementar preparación secuencial: decodificar JPEG/PNG/WebP (y HEIC/HEIF solo cuando el navegador pueda decodificarlo), aplicar orientación del navegador, canvas máximo 1600 px, salida JPEG y reducción iterativa hasta ≤300 KiB. Si HEIC/HEIF no se decodifica, mostrar un error específico inmediato.
- [ ] Rechazar antes de leer o decodificar cualquier archivo mayor a 15 MiB y usar decodificación redimensionada cuando la API del navegador lo permita.
- [ ] Verificar el tamaño final antes de aceptar cada adjunto; nunca conservar bytes originales ni metadatos.
- [ ] Usar en la prueba/helper un JPEG real que contenga un segmento EXIF y comprobar que los bytes JPEG de salida ya no contienen ese segmento.
- [ ] Agregar el bloque opcional “Evidencias fotográficas” en revisión final, con selector múltiple, progreso por archivo, previsualización, contador, eliminación, privacidad y mensajes accesibles.
- [ ] Deshabilitar guardar mientras se procesan fotos; conservar adjuntos tras un fallo de envío; liberar URLs de objeto y resetear el input para permitir reselección.
- [ ] Estilizar una cuadrícula adaptable; en móvil usar una columna, objetivos táctiles amplios y evitar desbordamiento.
- [ ] Hacer que `assessment-api` tolere respuestas de error no JSON y traduzca HTTP 413 a un mensaje específico para reducir/eliminar fotos.
- [ ] Ejecutar pruebas enfocadas.

### Task 4: Migración, verificación y despliegue

**Files:**
- Verify all changed files and generated migration metadata.

- [ ] Ejecutar `npm run verify`.
- [ ] Confirmar que la prueba PostgreSQL desechable con PGlite se ejecutó (no omitida) dentro de la verificación completa.
- [ ] Ejecutar smoke de navegador en un viewport móvil estrecho para selección, previsualización, eliminación y ausencia de desbordamiento.
- [ ] Consultar identidad, conteos y estado de migraciones en producción sin imprimir secretos; confirmar el mecanismo recuperable del proveedor antes de migrar.
- [ ] Aplicar `npm run db:migrate` con `.env.local` y verificar que los conteos no cambian y la tabla existe.
- [ ] Commit y push a `main` si la verificación está limpia.
- [ ] Esperar el despliegue de Vercel y ejecutar un smoke autenticado: guardar una evaluación temporal con foto, verificar bytes/MIME en PostgreSQL y borrar solo el registro temporal.

## Límites operativos

- Las fotos son opcionales y se aceptan máximo cuatro por evaluación.
- Cada foto persistida ocupa como máximo 300 KiB; una evaluación agrega como máximo 1,2 MiB antes de overhead de PostgreSQL.
- El sistema es un despliegue de emergencia de volumen acotado. La retención inicial es indefinida porque no existe aún un flujo autorizado de borrado de evaluaciones; al superar 1.000 evaluaciones (~1,2 GiB máximo de imágenes) se debe migrar a almacenamiento privado de objetos y definir una política formal de retención.
- La base de datos conserva recuperación administrada por Neon; antes de migrar se comprobará la identidad exacta de la base y la disponibilidad de restore/branching sin crear ni borrar ramas automáticamente.
