import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import XLSX from 'xlsx'
import { PrismaClient } from '@prisma/client'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..', '..')
const oldDataDir = path.join(rootDir, 'Old data')
const prisma = new PrismaClient()

const DRY_RUN = process.argv.includes('--dry-run')
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith('--limit='))
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split('=')[1]) : null
const FILE_ARGS = process.argv
  .filter((arg) => arg.startsWith('--file='))
  .map((arg) => arg.slice('--file='.length))
  .filter(Boolean)
const SOURCE_PREFIX = 'Old data source:'

const normalizeSpace = (value) =>
  String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()

const normalizeKey = (value) => normalizeSpace(value).toLowerCase()

const stringify = (value) => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)))
  return normalizeSpace(value)
}

const categoryFor = (category, name) => {
  const raw = normalizeKey(category)
  const instrumentName = normalizeKey(name)
  if (instrumentName.includes('humidity')) return 'Humidity transmitter'
  if (raw.includes('switch')) return 'Switches'
  if (raw.includes('gauge') || raw.includes('gage')) return 'Gauges'
  if (raw.includes('transmitter')) return 'Transmitter'
  return stringify(category) || 'Gauges'
}

const canonicalModelKey = (row) =>
  [
    normalizeKey(row.make),
    normalizeKey(row.model),
    normalizeKey(row.series),
  ].join('|')

const legacyIdFor = (row) => {
  const stable = [
    row.file,
    row.sheet,
    row.sr,
    row.make,
    row.model,
    row.series,
    row.rangeStart,
    row.rangeEnd,
    row.rangeUnit,
  ].map(stringify).join('|')
  return crypto.createHash('sha1').update(stable).digest('hex').slice(0, 12)
}

const findHeaderRow = (rows) =>
  rows.findIndex((row) =>
    row.some((cell) => normalizeKey(cell).replace(/\s+/g, '').includes('instrumentname')) &&
    row.some((cell) => normalizeKey(cell).includes('model'))
  )

const indexOfHeader = (headers, candidates) => {
  const normalized = headers.map((header) => normalizeKey(header).replace(/\s+/g, ' '))
  return normalized.findIndex((header) =>
    candidates.some((candidate) => header === candidate || header.includes(candidate))
  )
}

const readRowsFromSheet = (file, sheetName, sheet) => {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const headerRowIndex = findHeaderRow(rows)
  if (headerRowIndex === -1) return []

  const headers = rows[headerRowIndex]
  const srIdx = indexOfHeader(headers, ['sr. no.', 'sr.no.', 'sr no'])
  const nameIdx = indexOfHeader(headers, ['instrument name'])
  const makeIdx = indexOfHeader(headers, ['make'])
  const modelIdx = indexOfHeader(headers, ['model'])
  const seriesIdx = indexOfHeader(headers, ['series'])
  const categoryIdx = indexOfHeader(headers, ['category'])
  const resolutionIdx = indexOfHeader(headers, ['resolution'])
  const accuracyIdx = indexOfHeader(headers, ['accuracy'])
  const readingAccuracyIdx = indexOfHeader(headers, ['reading accuracy'])
  const descriptionIdx = indexOfHeader(headers, ['description'])
  const standardStartIdx = indexOfHeader(headers, ['standard 1'])

  const rangeStartIdx = indexOfHeader(headers, ['range start', 'rh range start', 'temperature range start'])
  const rangeEndIdx = indexOfHeader(headers, ['range end', 'rh range end', 'temperature range end'])
  const unitIdx = indexOfHeader(headers, ['unit', 'rh unit', 'temperature unit'])
  const calibrationPointsIdx = indexOfHeader(headers, ['calibration points'])

  const dataRows = []

  for (const row of rows.slice(headerRowIndex + 1)) {
    const name = stringify(row[nameIdx])
    const model = stringify(row[modelIdx]).replace(/\n+/g, ' ')
    if (!name || !model) continue

    const standards = []
    if (standardStartIdx !== -1) {
      for (let i = standardStartIdx; i < Math.min(headers.length, standardStartIdx + 3); i += 1) {
        const standard = stringify(row[i])
        if (standard) standards.push(standard)
      }
    }

    const calibrationPoints = []
    if (calibrationPointsIdx !== -1 && descriptionIdx !== -1) {
      for (let i = calibrationPointsIdx; i < descriptionIdx; i += 1) {
        const point = stringify(row[i])
        if (point) calibrationPoints.push(point)
      }
    }

    const rawDescription = stringify(row[descriptionIdx])
    const sourceLine = `${SOURCE_PREFIX} ${file} / ${sheetName}`
    const standardsLine = standards.length ? `Reference standards: ${standards.join(', ')}` : ''
    const description = [rawDescription, standardsLine, sourceLine].filter(Boolean).join('\n\n')

    const parsed = {
      file,
      sheet: sheetName,
      sr: stringify(row[srIdx]),
      name,
      serial: stringify(row[srIdx]) || model,
      make: stringify(row[makeIdx]) || 'Unknown',
      model,
      series: stringify(row[seriesIdx]) || null,
      category: categoryFor(row[categoryIdx], name),
      rangeStart: stringify(row[rangeStartIdx]) || null,
      rangeEnd: stringify(row[rangeEndIdx]) || null,
      rangeUnit: stringify(row[unitIdx]) || null,
      accuracy: stringify(row[accuracyIdx]) || null,
      accuracyType: stringify(row[accuracyIdx]) ? '±' : null,
      resolution: stringify(row[resolutionIdx]) || null,
      type: null,
      instrumentId: standards.join(', ') || null,
      calibrationPoints: calibrationPoints.join(', ') || null,
      readingAccuracy: stringify(row[readingAccuracyIdx]) || null,
      description,
      calibrationPeriod: null,
    }

    dataRows.push(parsed)
  }

  return dataRows
}

const collectRowsFromWorkbook = (filePath) => {
  const workbook = XLSX.readFile(filePath)
  const file = path.basename(filePath)
  const rows = []

  for (const sheetName of workbook.SheetNames) {
    rows.push(...readRowsFromSheet(file, sheetName, workbook.Sheets[sheetName]))
  }

  return rows
}

const collectOldDataRows = () => {
  if (FILE_ARGS.length) {
    return FILE_ARGS.flatMap((filePath) => {
      const resolved = path.resolve(filePath)
      if (!fs.existsSync(resolved)) {
        throw new Error(`Excel file not found: ${resolved}`)
      }
      return collectRowsFromWorkbook(resolved)
    })
  }

  if (!fs.existsSync(oldDataDir)) {
    throw new Error(`Old data folder not found: ${oldDataDir}`)
  }

  const rows = []
  const files = fs.readdirSync(oldDataDir)
    .filter((file) => file.toLowerCase().endsWith('.xlsx'))
    .sort((a, b) => a.localeCompare(b))

  for (const file of files) {
    rows.push(...collectRowsFromWorkbook(path.join(oldDataDir, file)))
  }

  return rows
}

const main = async () => {
  const oldRows = collectOldDataRows()
  const uniqueRows = []
  const seenOldKeys = new Set()

  for (const row of oldRows) {
    const key = canonicalModelKey(row)
    if (!key.replace(/\|/g, '')) continue
    if (seenOldKeys.has(key)) continue
    seenOldKeys.add(key)
    uniqueRows.push({ ...row, legacyId: legacyIdFor(row), modelKey: key })
  }

  const existingInstruments = await prisma.instrument.findMany({
    select: {
      make: true,
      model: true,
      series: true,
      description: true,
    },
  })

  const existingKeys = new Set(existingInstruments.map((instrument) => canonicalModelKey(instrument)))
  const existingOldSourceCount = existingInstruments.filter((instrument) =>
    normalizeSpace(instrument.description).includes(SOURCE_PREFIX)
  ).length

  const toCreate = uniqueRows.filter((row) => !existingKeys.has(row.modelKey))
  const selectedRows = LIMIT ? toCreate.slice(0, LIMIT) : toCreate

  const summary = {
    dryRun: DRY_RUN,
    excelRowsFound: oldRows.length,
    uniqueOldModels: uniqueRows.length,
    alreadyInDatabase: uniqueRows.length - toCreate.length,
    existingOldSourceRecords: existingOldSourceCount,
    readyToCreate: toCreate.length,
    selectedForThisRun: selectedRows.length,
  }

  console.log(JSON.stringify(summary, null, 2))

  if (selectedRows.length) {
    console.log('Sample rows:')
    console.log(JSON.stringify(selectedRows.slice(0, 5).map((row) => ({
      name: row.name,
      make: row.make,
      model: row.model,
      category: row.category,
      range: [row.rangeStart, row.rangeEnd, row.rangeUnit].filter(Boolean).join(' to '),
      standards: row.instrumentId,
      source: `${row.file} / ${row.sheet}`,
    })), null, 2))
  }

  if (DRY_RUN || !selectedRows.length) return

  const oldDataCustomer =
    (await prisma.customer.findFirst({ where: { name: 'Old Data Import' } })) ||
    (await prisma.customer.create({
      data: {
        name: 'Old Data Import',
        phone: '',
        address: 'Imported from Old data Excel files',
      },
    }))

  let created = 0
  const createRows = selectedRows.map((row) => ({
        name: row.name,
        serial: row.serial,
        make: row.make,
        model: row.model,
        category: row.category,
        customerId: oldDataCustomer.id,
        series: row.series,
        rangeStart: row.rangeStart,
        rangeEnd: row.rangeEnd,
        rangeUnit: row.rangeUnit,
        accuracy: row.accuracy,
        accuracyType: row.accuracyType,
        resolution: row.resolution,
        type: row.type,
        instrumentId: row.instrumentId,
        calibrationPoints: row.calibrationPoints,
        readingAccuracy: row.readingAccuracy,
        description: `${row.description}\nLegacy import id: ${row.legacyId}`,
        calibrationPeriod: row.calibrationPeriod,
      }))

  const chunkSize = 100
  for (let i = 0; i < createRows.length; i += chunkSize) {
    const chunk = createRows.slice(i, i + chunkSize)
    const result = await prisma.instrument.createMany({ data: chunk })
    created += result.count
    if (created % 100 === 0 || created === createRows.length) {
      console.log(`Created ${created}/${createRows.length}`)
    }
  }

  console.log(JSON.stringify({ created, customerId: oldDataCustomer.id }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
