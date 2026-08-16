import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb } from 'pdf-lib'

import {
    ASSESSMENT_SECTIONS,
    type AssessmentAnswer,
    type AssessmentSection,
} from '../shared/assessment.js'

export type AssessmentExportResponse = {
    criterionKey: string
    answer: AssessmentAnswer
    comments: string
    quantities: Record<string, number>
}

export type AssessmentExportPhoto = {
    position: number
    mimeType: string
    data: Buffer
}

export type AssessmentExportRecord = {
    id: string
    formVersion: string
    institution: string
    visitDate: string
    municipality: string
    department: string
    contactName: string
    contactRole: string
    phone: string
    email: string
    protectionRiskDetails: string
    generalObservations: string
    visitors: string[]
    createdAt: Date
    createdBy: string
    responses: AssessmentExportResponse[]
    photos: AssessmentExportPhoto[]
}

type ExportCriterion = {
    sectionKey: string
    sectionTitle: string
    key: string
    label: string
    quantityFields: readonly { key: string; label: string }[]
    response?: AssessmentExportResponse
    unknown: boolean
}

function snapshotSections(sections: readonly AssessmentSection[]): readonly AssessmentSection[] {
    return Object.freeze(
        sections.map((section) =>
            Object.freeze({
                ...section,
                criteria: Object.freeze(
                    section.criteria.map((criterion) =>
                        Object.freeze({
                            ...criterion,
                            quantityFields: criterion.quantityFields
                                ? Object.freeze(
                                      criterion.quantityFields.map((field) =>
                                          Object.freeze({ ...field }),
                                      ),
                                  )
                                : undefined,
                        }),
                    ),
                ),
            }),
        ),
    )
}

const FORM_2026_08_10 = snapshotSections(ASSESSMENT_SECTIONS)

/** Immutable export definitions. Add a new snapshot when a form version changes. */
export const ASSESSMENT_EXPORT_FORM_DEFINITIONS: Readonly<
    Record<string, readonly AssessmentSection[]>
> = Object.freeze({
    '2026-08-10': FORM_2026_08_10,
})

function formSections(formVersion: string): readonly AssessmentSection[] {
    return ASSESSMENT_EXPORT_FORM_DEFINITIONS[formVersion] ?? FORM_2026_08_10
}

function exportCriteria(record: AssessmentExportRecord): ExportCriterion[] {
    const responsesByKey = new Map(
        record.responses.map((response) => [response.criterionKey, response]),
    )
    const knownKeys = new Set<string>()
    const canonical = formSections(record.formVersion).flatMap((section) =>
        section.criteria.map((criterion) => {
            knownKeys.add(criterion.key)
            return {
                sectionKey: section.key,
                sectionTitle: section.title,
                key: criterion.key,
                label: criterion.label,
                quantityFields: criterion.quantityFields ?? [],
                response: responsesByKey.get(criterion.key),
                unknown: false,
            }
        }),
    )
    const unknown = record.responses
        .filter((response) => !knownKeys.has(response.criterionKey))
        .map((response) => ({
            sectionKey: 'historical_unknown',
            sectionTitle: 'Respuestas históricas no reconocidas',
            key: response.criterionKey,
            label: `Criterio almacenado no reconocido: ${response.criterionKey}`,
            quantityFields: Object.keys(response.quantities)
                .sort((left, right) => left.localeCompare(right, 'es'))
                .map((key) => ({ key, label: key })),
            response,
            unknown: true,
        }))
    return [...canonical, ...unknown]
}

const CSV_HEADERS = [
    'id_evaluacion',
    'version_formulario',
    'institucion',
    'fecha_visita',
    'municipio',
    'departamento',
    'nombre_contacto',
    'cargo_contacto',
    'telefono',
    'correo',
    'detalles_riesgos_proteccion',
    'observaciones_generales',
    'visitantes',
    'fecha_creacion',
    'creado_por',
    'clave_seccion',
    'seccion',
    'clave_criterio',
    'criterio',
    'respuesta',
    'comentarios',
    'etiquetas_cantidades',
    'valores_cantidades',
    'cantidad_fotos',
] as const

function neutralizeFormula(value: string): string {
    if (value.startsWith('\t') || value.startsWith('\r') || value.startsWith('\n')) {
        return `'${value}`
    }
    const firstMeaningful = [...value].find((character) => {
        const codePoint = character.codePointAt(0) ?? 0
        return (
            character.trim() !== '' &&
            !(codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
        )
    })
    return firstMeaningful && '=+-@'.includes(firstMeaningful) ? `'${value}` : value
}

function csvCell(value: string | number): string {
    const safe = neutralizeFormula(String(value))
    return /[",\r\n]/u.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

function csvRow(values: readonly (string | number)[]): string {
    return `${values.map(csvCell).join(',')}\r\n`
}

export function createAssessmentCsvHeader(): string {
    return `\uFEFF${csvRow(CSV_HEADERS)}`
}

const ANSWER_LABELS: Readonly<Record<AssessmentAnswer, string>> = {
    yes: 'Sí',
    no: 'No',
    not_observable: 'No observable',
}

export function createAssessmentCsvChunk(record: AssessmentExportRecord): string {
    const metadata = [
        record.id,
        record.formVersion,
        record.institution,
        record.visitDate,
        record.municipality,
        record.department,
        record.contactName,
        record.contactRole,
        record.phone,
        record.email,
        record.protectionRiskDetails,
        record.generalObservations,
        record.visitors.join(' | '),
        record.createdAt.toISOString(),
        record.createdBy,
    ]
    return exportCriteria(record)
        .map((criterion) => {
            const quantityLabels = criterion.quantityFields.map((field) => field.label)
            const quantityValues = criterion.quantityFields.map((field) => {
                const value = criterion.response?.quantities[field.key]
                return value === undefined ? '' : String(value)
            })
            return csvRow([
                ...metadata,
                criterion.sectionKey,
                criterion.sectionTitle,
                criterion.key,
                criterion.label,
                criterion.response ? ANSWER_LABELS[criterion.response.answer] : '',
                criterion.response?.comments ?? '',
                quantityLabels.join(' | '),
                quantityValues.join(' | '),
                record.photos.length,
            ])
        })
        .join('')
}

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const PAGE_MARGIN = 46
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2
const BLUE = rgb(0, 0.22, 0.58)
const RED = rgb(0.81, 0.07, 0.15)
const YELLOW = rgb(0.99, 0.82, 0.09)
const INK = rgb(0.08, 0.12, 0.2)
const MUTED = rgb(0.34, 0.39, 0.47)
const PALE = rgb(0.96, 0.97, 0.99)
const BORDER = rgb(0.83, 0.85, 0.89)
const require = createRequire(import.meta.url)
const REGULAR_FONT_PATH = require.resolve(
    '@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf',
)
const BOLD_FONT_PATH = require.resolve('@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf')

async function loadFontBytes(weight: 400 | 700): Promise<Uint8Array> {
    return readFile(weight === 400 ? REGULAR_FONT_PATH : BOLD_FONT_PATH)
}

function supportedText(value: unknown, supported: ReadonlySet<number>): string {
    const source = value === null || value === undefined ? '' : String(value)
    let result = ''
    for (const character of source.replaceAll('\r\n', '\n').replaceAll('\r', '\n')) {
        const codePoint = character.codePointAt(0)
        result += codePoint !== undefined && supported.has(codePoint) ? character : '?'
    }
    return result
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
    const paragraphs = text.split('\n')
    const lines: string[] = []
    for (const paragraph of paragraphs) {
        if (!paragraph) {
            lines.push('')
            continue
        }
        let line = ''
        for (const word of paragraph.split(/\s+/u)) {
            const candidate = line ? `${line} ${word}` : word
            if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
                line = candidate
                continue
            }
            if (line) lines.push(line)
            if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
                line = word
                continue
            }
            let fragment = ''
            for (const character of word) {
                const next = `${fragment}${character}`
                if (font.widthOfTextAtSize(next, fontSize) > maxWidth && fragment) {
                    lines.push(fragment)
                    fragment = character
                } else {
                    fragment = next
                }
            }
            line = fragment
        }
        lines.push(line)
    }
    return lines.length ? lines : ['']
}

type PdfContext = {
    document: PDFDocument
    regular: PDFFont
    bold: PDFFont
    supportedRegular: ReadonlySet<number>
    supportedBold: ReadonlySet<number>
    page: PDFPage
    y: number
}

function addPage(context: PdfContext): void {
    context.page = context.document.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    context.page.drawRectangle({
        x: 0,
        y: PAGE_HEIGHT - 11,
        width: PAGE_WIDTH / 2,
        height: 11,
        color: YELLOW,
    })
    context.page.drawRectangle({
        x: PAGE_WIDTH / 2,
        y: PAGE_HEIGHT - 11,
        width: PAGE_WIDTH / 4,
        height: 11,
        color: BLUE,
    })
    context.page.drawRectangle({
        x: (PAGE_WIDTH * 3) / 4,
        y: PAGE_HEIGHT - 11,
        width: PAGE_WIDTH / 4,
        height: 11,
        color: RED,
    })
    context.page.drawText('EVALUACIÓN DE ALBERGUE', {
        x: PAGE_MARGIN,
        y: PAGE_HEIGHT - 35,
        size: 8,
        font: context.bold,
        color: BLUE,
    })
    context.y = PAGE_HEIGHT - 55
}

function ensureSpace(context: PdfContext, height: number): void {
    if (context.y - height < 48) addPage(context)
}

function drawWrapped(
    context: PdfContext,
    value: unknown,
    options: {
        x?: number
        width?: number
        size?: number
        lineHeight?: number
        bold?: boolean
        color?: ReturnType<typeof rgb>
        gapAfter?: number
    } = {},
): number {
    const font = options.bold ? context.bold : context.regular
    const supported = options.bold ? context.supportedBold : context.supportedRegular
    const size = options.size ?? 9
    const lineHeight = options.lineHeight ?? size * 1.35
    const x = options.x ?? PAGE_MARGIN
    const width = options.width ?? CONTENT_WIDTH
    const lines = wrapText(supportedText(value, supported), font, size, width)
    const height = lines.length * lineHeight
    for (const line of lines) {
        ensureSpace(context, lineHeight)
        context.page.drawText(line, {
            x,
            y: context.y - size,
            size,
            font,
            color: options.color ?? INK,
        })
        context.y -= lineHeight
    }
    context.y -= options.gapAfter ?? 0
    return height
}

function drawSectionTitle(context: PdfContext, title: string): void {
    ensureSpace(context, 42)
    context.page.drawRectangle({
        x: PAGE_MARGIN,
        y: context.y - 29,
        width: CONTENT_WIDTH,
        height: 31,
        color: BLUE,
    })
    context.y -= 8
    drawWrapped(context, title.toUpperCase(), {
        x: PAGE_MARGIN + 12,
        width: CONTENT_WIDTH - 24,
        size: 10,
        lineHeight: 12,
        bold: true,
        color: rgb(1, 1, 1),
        gapAfter: 15,
    })
}

function drawMetadataRow(context: PdfContext, label: string, value: unknown): void {
    const safeValue = supportedText(value || 'No registrado', context.supportedRegular)
    const valueLines = wrapText(safeValue, context.regular, 8.5, CONTENT_WIDTH - 142)
    const rowHeight = Math.max(25, valueLines.length * 11 + 10)
    ensureSpace(context, rowHeight + 3)
    const top = context.y
    context.page.drawRectangle({
        x: PAGE_MARGIN,
        y: top - rowHeight + 2,
        width: CONTENT_WIDTH,
        height: rowHeight,
        color: PALE,
        borderColor: BORDER,
        borderWidth: 0.6,
    })
    context.page.drawText(supportedText(label, context.supportedBold), {
        x: PAGE_MARGIN + 8,
        y: top - 15,
        size: 7.5,
        font: context.bold,
        color: MUTED,
    })
    for (const [index, line] of valueLines.entries()) {
        context.page.drawText(line, {
            x: PAGE_MARGIN + 135,
            y: top - 15 - index * 11,
            size: 8.5,
            font: context.regular,
            color: INK,
        })
    }
    context.y -= rowHeight + 2
}

function drawCriterion(context: PdfContext, criterion: ExportCriterion, index: number): void {
    ensureSpace(context, 85)
    context.page.drawRectangle({
        x: PAGE_MARGIN,
        y: context.y - 4,
        width: 28,
        height: 18,
        color: criterion.unknown ? RED : YELLOW,
    })
    context.page.drawText(String(index).padStart(2, '0'), {
        x: PAGE_MARGIN + 7,
        y: context.y + 1,
        size: 8,
        font: context.bold,
        color: criterion.unknown ? rgb(1, 1, 1) : BLUE,
    })
    drawWrapped(context, criterion.label, {
        x: PAGE_MARGIN + 38,
        width: CONTENT_WIDTH - 38,
        size: 9.5,
        lineHeight: 12.5,
        bold: true,
        gapAfter: 4,
    })
    const response = criterion.response
    drawWrapped(
        context,
        `Respuesta: ${response ? ANSWER_LABELS[response.answer] : 'Sin respuesta registrada'}`,
        {
            x: PAGE_MARGIN + 38,
            width: CONTENT_WIDTH - 38,
            size: 8.5,
            bold: true,
            color: response ? BLUE : RED,
            gapAfter: 2,
        },
    )
    if (criterion.quantityFields.length) {
        const quantities = criterion.quantityFields
            .map((field) => `${field.label}: ${response?.quantities[field.key] ?? 'Sin dato'}`)
            .join('  |  ')
        drawWrapped(context, quantities, {
            x: PAGE_MARGIN + 38,
            width: CONTENT_WIDTH - 38,
            size: 8,
            color: MUTED,
            gapAfter: 2,
        })
    }
    if (response?.comments) {
        drawWrapped(context, `Comentarios: ${response.comments}`, {
            x: PAGE_MARGIN + 38,
            width: CONTENT_WIDTH - 38,
            size: 8,
            color: MUTED,
            gapAfter: 2,
        })
    }
    context.page.drawLine({
        start: { x: PAGE_MARGIN + 38, y: context.y },
        end: { x: PAGE_WIDTH - PAGE_MARGIN, y: context.y },
        thickness: 0.5,
        color: BORDER,
    })
    context.y -= 13
}

async function drawPhoto(
    context: PdfContext,
    photo: AssessmentExportPhoto,
    index: number,
): Promise<void> {
    let image: PDFImage
    try {
        image = await context.document.embedJpg(photo.data)
    } catch {
        drawWrapped(context, `Foto ${index}: archivo JPEG no válido`, { color: RED, gapAfter: 8 })
        return
    }
    const maxHeight = 560
    const scale = Math.min(CONTENT_WIDTH / image.width, maxHeight / image.height, 1)
    const width = image.width * scale
    const height = image.height * scale
    ensureSpace(context, height + 38)
    drawWrapped(context, `Foto ${index}`, { bold: true, color: BLUE, gapAfter: 6 })
    context.page.drawImage(image, {
        x: PAGE_MARGIN + (CONTENT_WIDTH - width) / 2,
        y: context.y - height,
        width,
        height,
    })
    context.y -= height + 18
}

function addPageNumbers(context: PdfContext): void {
    const pages = context.document.getPages()
    for (const [index, page] of pages.entries()) {
        const label = `Página ${index + 1} de ${pages.length}`
        const safeLabel = supportedText(label, context.supportedRegular)
        page.drawLine({
            start: { x: PAGE_MARGIN, y: 34 },
            end: { x: PAGE_WIDTH - PAGE_MARGIN, y: 34 },
            thickness: 0.5,
            color: BORDER,
        })
        page.drawText(safeLabel, {
            x: PAGE_WIDTH - PAGE_MARGIN - context.regular.widthOfTextAtSize(safeLabel, 7.5),
            y: 20,
            size: 7.5,
            font: context.regular,
            color: MUTED,
        })
        page.drawText('Ayuda Colombia - Evaluación de protección', {
            x: PAGE_MARGIN,
            y: 20,
            size: 7.5,
            font: context.regular,
            color: MUTED,
        })
    }
}

export async function createAssessmentPdf(record: AssessmentExportRecord): Promise<Uint8Array> {
    const document = await PDFDocument.create()
    document.registerFontkit(fontkit)
    const [regularBytes, boldBytes] = await Promise.all([loadFontBytes(400), loadFontBytes(700)])
    const [regular, bold] = await Promise.all([
        document.embedFont(regularBytes, { subset: false }),
        document.embedFont(boldBytes, { subset: false }),
    ])
    const supportedRegular = new Set(regular.getCharacterSet())
    const supportedBold = new Set(bold.getCharacterSet())
    const context: PdfContext = {
        document,
        regular,
        bold,
        supportedRegular,
        supportedBold,
        page: document.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
        y: 0,
    }
    document.removePage(0)
    addPage(context)

    const safeInstitution = supportedText(record.institution, supportedRegular)
    document.setTitle(`Evaluación de albergue - ${safeInstitution}`)
    document.setSubject(
        `Formulario ${record.formVersion} - Evaluación de protección, género e inclusión`,
    )
    document.setAuthor('Ayuda Colombia')
    document.setCreator('Ayuda Colombia')
    document.setProducer('Ayuda Colombia')
    document.setCreationDate(record.createdAt)

    drawWrapped(context, 'EVALUACIÓN DE PROTECCIÓN, GÉNERO E INCLUSIÓN', {
        size: 18,
        lineHeight: 22,
        bold: true,
        color: BLUE,
        gapAfter: 3,
    })
    drawWrapped(context, record.institution, {
        size: 13,
        lineHeight: 17,
        bold: true,
        color: RED,
        gapAfter: 15,
    })

    drawSectionTitle(context, 'Datos de la visita')
    drawMetadataRow(context, 'ID de evaluación', record.id)
    drawMetadataRow(context, 'Versión del formulario', record.formVersion)
    drawMetadataRow(context, 'Fecha de visita', record.visitDate)
    drawMetadataRow(context, 'Ubicación', `${record.municipality}, ${record.department}`)
    drawMetadataRow(
        context,
        'Contacto',
        `${record.contactName}${record.contactRole ? ` - ${record.contactRole}` : ''}`,
    )
    drawMetadataRow(context, 'Teléfono', record.phone)
    drawMetadataRow(context, 'Correo', record.email)
    drawMetadataRow(context, 'Visitantes', record.visitors.join(', '))
    drawMetadataRow(context, 'Registrado por', record.createdBy)
    drawMetadataRow(context, 'Fecha de registro', record.createdAt.toISOString())

    drawSectionTitle(context, 'Observaciones y riesgos')
    drawWrapped(context, 'DETALLES SOBRE RIESGOS DE PROTECCIÓN', {
        size: 8,
        bold: true,
        color: MUTED,
        gapAfter: 4,
    })
    drawWrapped(context, record.protectionRiskDetails || 'Sin información registrada.', {
        gapAfter: 12,
    })
    drawWrapped(context, 'OBSERVACIONES GENERALES', {
        size: 8,
        bold: true,
        color: MUTED,
        gapAfter: 4,
    })
    drawWrapped(context, record.generalObservations || 'Sin información registrada.', {
        gapAfter: 15,
    })

    let currentSection = ''
    for (const [index, criterion] of exportCriteria(record).entries()) {
        if (criterion.sectionKey !== currentSection) {
            drawSectionTitle(context, criterion.sectionTitle)
            currentSection = criterion.sectionKey
        }
        drawCriterion(context, criterion, index + 1)
    }

    if (record.photos.length) {
        drawSectionTitle(context, 'Registro fotográfico')
        const photos = [...record.photos].sort((left, right) => left.position - right.position)
        for (const [index, photo] of photos.entries()) await drawPhoto(context, photo, index + 1)
    }

    addPageNumbers(context)
    return document.save({ useObjectStreams: false })
}
