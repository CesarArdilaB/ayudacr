// @vitest-environment node

import { performance } from 'node:perf_hooks'
import { createCanvas } from '@napi-rs/canvas'
import { PDFDocument } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'

import { ASSESSMENT_CRITERIA } from '../shared/assessment.js'
import {
    type AssessmentCsvRecord,
    type AssessmentPdfRecord,
    createAssessmentCsvChunk,
    createAssessmentCsvHeader,
    createAssessmentPdf,
} from './assessment-exports.js'

function record(overrides: Partial<AssessmentPdfRecord> = {}): AssessmentPdfRecord {
    return {
        id: '11111111-1111-4111-8111-111111111111',
        formVersion: '2026-08-10',
        institution: 'Albergue Dignidad',
        visitDate: '2026-08-16',
        municipality: 'Uribia',
        department: 'La Guajira',
        contactName: 'Süleymán Epinayú',
        contactRole: 'Líder comunitario',
        phone: '+57 300 123 4567',
        email: 'contacto@example.org',
        protectionRiskDetails: 'Sin riesgos adicionales.',
        generalObservations: 'Atención para niñas, niños y comunidad Wayúu.',
        visitors: ['María José', 'Jüsü Püshaina'],
        createdAt: new Date('2026-08-16T15:30:00.000Z'),
        createdBy: 'nataliavalderramacastro@gmail.com',
        responses: [],
        photos: [],
        ...overrides,
    }
}

function csvRecord(overrides: Partial<AssessmentCsvRecord> = {}): AssessmentCsvRecord {
    const { photos: _photos, ...metadata } = record()
    return { ...metadata, photoCount: 0, ...overrides }
}

function parseCsvRow(row: string): string[] {
    const values: string[] = []
    let value = ''
    let quoted = false
    for (let index = 0; index < row.length; index += 1) {
        const character = row[index]
        if (character === '"') {
            if (quoted && row[index + 1] === '"') {
                value += '"'
                index += 1
            } else {
                quoted = !quoted
            }
        } else if (character === ',' && !quoted) {
            values.push(value)
            value = ''
        } else {
            value += character
        }
    }
    values.push(value)
    return values
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
    const document = await getDocument({ data: bytes.slice() }).promise
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        pages.push(
            content.items
                .map((item) => ('str' in item ? item.str : ''))
                .join(' ')
                .replace(/\s+/gu, ' '),
        )
    }
    return pages.join('\n')
}

async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
    const document = await getDocument({ data: bytes.slice() }).promise
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        pages.push(
            content.items
                .map((item) => ('str' in item ? item.str : ''))
                .join(' ')
                .replace(/\s+/gu, ' '),
        )
    }
    return pages
}

async function pdfTextVerticalBounds(bytes: Uint8Array): Promise<{ min: number; max: number }> {
    const document = await getDocument({ data: bytes.slice() }).promise
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        for (const item of content.items) {
            if (!('str' in item) || item.str.length === 0) continue
            min = Math.min(min, item.transform[5])
            max = Math.max(max, item.transform[5])
        }
    }
    return { min, max }
}

function textAtLimit(marker: string, limit: number): string {
    const body = 'Información detallada para seguimiento comunitario y acciones requeridas. '
    return `${body.repeat(Math.ceil((limit - marker.length) / body.length)).slice(0, limit - marker.length)}${marker}`
}

describe('assessment CSV serialization', () => {
    it('writes one BOM in the header and no BOM in assessment chunks', () => {
        const header = createAssessmentCsvHeader()
        const chunk = createAssessmentCsvChunk(csvRecord())

        expect(header.startsWith('\uFEFF')).toBe(true)
        expect(header.slice(1)).not.toContain('\uFEFF')
        expect(chunk).not.toContain('\uFEFF')
        expect(header).toContain('version_formulario')
        expect(header.endsWith('\r\n')).toBe(true)
        expect(chunk.endsWith('\r\n')).toBe(true)
    })

    it('uses canonical order, represents missing answers, and appends unknown stored keys', () => {
        const output = createAssessmentCsvChunk(
            csvRecord({
                responses: [
                    {
                        criterionKey: ASSESSMENT_CRITERIA[1].key,
                        answer: 'no',
                        comments: 'Requiere seguimiento',
                        quantities: {},
                    },
                    {
                        criterionKey: 'legacy_unknown_criterion',
                        answer: 'yes',
                        comments: 'Dato histórico',
                        quantities: { families: 7 },
                    },
                ],
            }),
        )
        const rows = output.trimEnd().split('\r\n').map(parseCsvRow)
        const criterionKeyIndex = 17
        const answerIndex = 19

        expect(rows).toHaveLength(ASSESSMENT_CRITERIA.length + 1)
        expect(rows[0][criterionKeyIndex]).toBe(ASSESSMENT_CRITERIA[0].key)
        expect(rows[0][answerIndex]).toBe('')
        expect(rows[1][answerIndex]).toBe('No')
        expect(rows.at(-1)?.[criterionKeyIndex]).toBe('legacy_unknown_criterion')
        expect(rows.at(-1)?.[18]).toContain('legacy_unknown_criterion')
    })

    it('quotes RFC4180 values and neutralizes formulas after whitespace or controls', () => {
        const output = createAssessmentCsvChunk(
            csvRecord({
                institution: 'Albergue "Norte", sede 2',
                contactRole: '\u00a0@IMPORTXML("https://evil.test")',
                phone: '+57 300 123 4567',
                generalObservations: '\t=HYPERLINK("https://evil.test")\nsegunda línea',
                responses: [
                    {
                        criterionKey: ASSESSMENT_CRITERIA[0].key,
                        answer: 'yes',
                        comments: '\u0001 @SUM(1,2)',
                        quantities: { people: 12 },
                    },
                ],
            }),
        )
        const rows = output.trimEnd().split('\r\n')
        const first = parseCsvRow(rows[0])

        expect(first[2]).toBe('Albergue "Norte", sede 2')
        expect(first[7]).toBe('\'\u00a0@IMPORTXML("https://evil.test")')
        expect(first[8]).toBe("'+57 300 123 4567")
        expect(first[11]).toBe('\' =HYPERLINK("https://evil.test")\nsegunda línea')
        expect(first[20]).toBe("'  @SUM(1,2)")
        expect(output).not.toContain('\u0001')
        expect(output).toContain('"Albergue ""Norte"", sede 2"')
    })

    it.each([
        ['tabulador', '\ttexto', "' texto"],
        ['retorno de carro', '\rtexto', "'\rtexto"],
        ['salto de línea', '\ntexto', "'\ntexto"],
    ])(
        'neutralizes a leading %s even without a formula character',
        (_name, dangerous, expected) => {
            const output = createAssessmentCsvChunk(csvRecord({ institution: dangerous }))

            expect(output).toContain(expected)
            expect(output).not.toContain(`,${dangerous}`)
        },
    )

    it('removes arbitrary C0 and C1 controls while preserving record line breaks', () => {
        const output = createAssessmentCsvChunk(
            csvRecord({ institution: 'Albergue\u0007Norte\u0085Seguro' }),
        )

        expect(output).toContain('Albergue Norte Seguro')
        const unsafeControls = [...output].filter((character) => {
            const codePoint = character.codePointAt(0) ?? 0
            return (
                character !== '\r' &&
                character !== '\n' &&
                (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
            )
        })
        expect(unsafeControls).toEqual([])
    })

    it('serializes photo counts without requiring PDF photo buffers', () => {
        const recordWithoutPhotoBuffers: AssessmentCsvRecord = {
            ...csvRecord(),
            photoCount: 3,
        }

        const firstRow = createAssessmentCsvChunk(recordWithoutPhotoBuffers).split('\r\n')[0]
        expect(parseCsvRow(firstRow).at(-1)).toBe('3')
    })

    it('uses the requested historical form version with a stable fallback', () => {
        const known = createAssessmentCsvChunk(csvRecord({ formVersion: '2026-08-10' }))
        const future = createAssessmentCsvChunk(csvRecord({ formVersion: '2099-01-01' }))

        expect(known).toContain('Dignidad y grupos con necesidades específicas')
        expect(future).toContain('2099-01-01')
        expect(future).toContain(ASSESSMENT_CRITERIA[0].key)
    })
})

describe('assessment PDF serialization', () => {
    it('creates a polished multipage A4 PDF with metadata and all canonical criteria', async () => {
        const bytes = await createAssessmentPdf(record())
        const pdf = await PDFDocument.load(bytes)
        const text = await extractPdfText(bytes)

        expect(Buffer.from(bytes).subarray(0, 4).toString('ascii')).toBe('%PDF')
        expect(pdf.getPageCount()).toBeGreaterThan(2)
        expect(pdf.getTitle()).toContain('Albergue Dignidad')
        expect(pdf.getSubject()).toContain('2026-08-10')
        for (const section of [
            'DIGNIDAD Y GRUPOS CON NECESIDADES ESPECÍFICAS DE PROTECCIÓN',
            'ACCESO',
            'PARTICIPACIÓN',
            'SEGURIDAD',
            'PRINCIPALES RIESGOS DE PROTECCIÓN IDENTIFICADOS',
            'ALERTAS INMEDIATAS',
        ]) {
            expect(text).toContain(section)
        }
        expect(text.match(/Sin respuesta registrada/g)).toHaveLength(ASSESSMENT_CRITERIA.length)
        expect(text).toContain('Página 1 de')
        expect(text).toContain(`Página ${pdf.getPageCount()} de ${pdf.getPageCount()}`)
        for (const page of pdf.getPages()) {
            expect(page.getSize().width).toBeCloseTo(595.28, 0)
            expect(page.getSize().height).toBeCloseTo(841.89, 0)
        }
    })

    it('embeds JPEG photos and never throws on unsupported Unicode glyphs', async () => {
        const canvas = createCanvas(1_000, 1_000)
        const context = canvas.getContext('2d')
        context.fillStyle = '#fcd116'
        context.fillRect(0, 0, 1_000, 500)
        context.fillStyle = '#003893'
        context.fillRect(0, 500, 1_000, 250)
        context.fillStyle = '#ce1126'
        context.fillRect(0, 750, 1_000, 250)
        const jpeg = canvas.toBuffer('image/jpeg')

        const bytes = await createAssessmentPdf(
            record({
                institution: 'Albergue Iñaki - Eʼñepá 🌎',
                generalObservations: 'Comunidad Wayúu: Jüsü, Püshaina, niñez y símbolos 🚨 🪶.',
                responses: [
                    {
                        criterionKey: 'legacy_🦆',
                        answer: 'not_observable',
                        comments: `${'Texto histórico detallado '.repeat(40)}🦆.`,
                        quantities: { familias: 3, personas: 11 },
                    },
                ],
                photos: [{ position: 0, mimeType: 'image/jpeg', data: jpeg }],
            }),
        )
        const pdf = await PDFDocument.load(bytes)
        const raw = Buffer.from(bytes).toString('latin1')
        const text = await extractPdfText(bytes)
        const pages = await extractPdfPages(bytes)

        expect(pdf.getPageCount()).toBeGreaterThan(3)
        expect(raw).toContain('/Image')
        expect(text).toContain('REGISTRO FOTOGRÁFICO')
        expect(text).toContain('Foto 1')
        expect(text).toContain('RESPUESTAS HISTÓRICAS NO RECONOCIDAS')
        expect(text).toContain('Criterio almacenado no reconocido: legacy_?')
        expect(text).toContain('familias: 3')
        expect(text).toContain('personas: 11')
        expect(text).toContain('Wayúu: Jüsü, Püshaina, niñez')
        expect(text).not.toContain('🦆')
        expect(
            pages.some((page) => page.includes('REGISTRO FOTOGRÁFICO') && page.includes('Foto 1')),
        ).toBe(true)
    })

    it('paginates text at current field limits and preserves the final content', async () => {
        const bytes = await createAssessmentPdf(
            record({
                protectionRiskDetails: textAtLimit(' FIN-RIESGOS', 5_000),
                generalObservations: textAtLimit(' FIN-OBSERVACIONES', 5_000),
                visitors: Array.from({ length: 20 }, (_, index) =>
                    `${String(index + 1).padStart(2, '0')} ${'Nombre visitante '.repeat(7)}`.slice(
                        0,
                        120,
                    ),
                ),
                responses: [
                    {
                        criterionKey: ASSESSMENT_CRITERIA[0].key,
                        answer: 'yes',
                        comments: textAtLimit(' FIN-COMENTARIO', 2_000),
                        quantities: { people: 999_999 },
                    },
                ],
            }),
        )
        const pdf = await PDFDocument.load(bytes)
        const text = await extractPdfText(bytes)
        const verticalBounds = await pdfTextVerticalBounds(bytes)

        expect(pdf.getPageCount()).toBeGreaterThanOrEqual(7)
        expect(verticalBounds.min).toBeGreaterThanOrEqual(18)
        expect(verticalBounds.max).toBeLessThan(825)
        expect(text).toContain('FIN-RIESGOS')
        expect(text).toContain('FIN-OBSERVACIONES')
        expect(text).toContain('FIN-COMENTARIO')
        expect(text).toContain('20 Nombre visitante')
        expect(text).toContain(`Página ${pdf.getPageCount()} de ${pdf.getPageCount()}`)
    }, 20_000)

    it('stays within a serverless-safe budget at every current text limit', async () => {
        const maximumComment = textAtLimit(' FIN-COMENTARIO-MAXIMO', 2_000)
        const maximumRecord = record({
            protectionRiskDetails: textAtLimit(' FIN-RIESGOS-MAXIMO', 5_000),
            generalObservations: textAtLimit(' FIN-OBSERVACIONES-MAXIMO', 5_000),
            visitors: Array.from({ length: 20 }, () => 'V'.repeat(120)),
            responses: ASSESSMENT_CRITERIA.map((criterion) => ({
                criterionKey: criterion.key,
                answer: 'yes' as const,
                comments: maximumComment,
                quantities: {},
            })),
        })

        const startedAt = performance.now()
        const bytes = await createAssessmentPdf(maximumRecord)
        const elapsedMilliseconds = performance.now() - startedAt
        const text = await extractPdfText(bytes)

        expect(elapsedMilliseconds).toBeLessThan(3_000)
        expect(text.match(/FIN-COMENTARIO-MAXIMO/g)).toHaveLength(44)
        expect(text).toContain('FIN-RIESGOS-MAXIMO')
        expect(text).toContain('FIN-OBSERVACIONES-MAXIMO')
    }, 15_000)
})
