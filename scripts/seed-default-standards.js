import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const standards = [
  {
    instrument: 'Multifunctional Calibrator',
    calibrationDate: new Date('2025-05-13'),
    certExpiry: new Date('2026-05-12'),
    reportNo: 'CAL-25050083/ET/01',
    certificateNo: 'CAL-25050083/ET/01',
    make: null,
    serial: null,
    range: null,
    accuracy: null,
  },
  {
    instrument: 'Digital Manometer',
    calibrationDate: new Date('2025-10-18'),
    certExpiry: new Date('2026-10-17'),
    reportNo: 'CAL-25100187/PR/03',
    certificateNo: 'CAL-25100187/PR/03',
    make: null,
    serial: null,
    range: null,
    accuracy: null,
  },
  {
    instrument: 'Digital Manometer',
    calibrationDate: new Date('2025-10-18'),
    certExpiry: new Date('2026-10-17'),
    reportNo: 'CAL-25100187/PR/02',
    certificateNo: 'CAL-25100187/PR/02',
    make: null,
    serial: null,
    range: null,
    accuracy: null,
  },
  {
    instrument: 'Digital Manometer',
    calibrationDate: new Date('2025-10-18'),
    certExpiry: new Date('2026-10-17'),
    reportNo: 'CAL-25100187/PR/01',
    certificateNo: 'CAL-25100187/PR/01',
    make: null,
    serial: null,
    range: null,
    accuracy: null,
  },
]

async function main() {
  await prisma.$executeRawUnsafe('ALTER TABLE "Standard" DROP CONSTRAINT IF EXISTS "Standard_instrumentId_fkey"')
  await prisma.$executeRawUnsafe('ALTER TABLE "Standard" ALTER COLUMN "instrumentId" DROP NOT NULL')
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Standard"
    ADD CONSTRAINT "Standard_instrumentId_fkey"
    FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
  `)

  let created = 0
  let updated = 0

  for (const standard of standards) {
    const existing = await prisma.$queryRawUnsafe(
      'SELECT "id" FROM "Standard" WHERE "reportNo" = $1 LIMIT 1',
      standard.reportNo
    )

    if (existing.length) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Standard"
         SET "instrumentId" = NULL,
             "instrument" = $1,
             "calibrationDate" = $2,
             "certExpiry" = $3,
             "reportNo" = $4,
             "certificateNo" = $5,
             "make" = NULL,
             "serial" = NULL,
             "range" = NULL,
             "accuracy" = NULL,
             "updatedAt" = NOW()
         WHERE "id" = $6`,
        standard.instrument,
        standard.calibrationDate,
        standard.certExpiry,
        standard.reportNo,
        standard.certificateNo,
        existing[0].id
      )
      updated += 1
      continue
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO "Standard"
       ("instrumentId", "instrument", "calibrationDate", "reportNo", "certificateNo", "certExpiry", "make", "serial", "range", "accuracy", "createdAt", "updatedAt")
       VALUES (NULL, $1, $2, $3, $4, $5, NULL, NULL, NULL, NULL, NOW(), NOW())`,
      standard.instrument,
      standard.calibrationDate,
      standard.reportNo,
      standard.certificateNo,
      standard.certExpiry
    )
    created += 1
  }

  const total = await prisma.standard.count()
  console.log(JSON.stringify({ created, updated, total }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
