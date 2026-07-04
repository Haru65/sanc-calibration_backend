ALTER TABLE "Standard" DROP CONSTRAINT IF EXISTS "Standard_instrumentId_fkey";

ALTER TABLE "Standard" ALTER COLUMN "instrumentId" DROP NOT NULL;

ALTER TABLE "Standard"
ADD CONSTRAINT "Standard_instrumentId_fkey"
FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
