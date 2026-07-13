-- AlterTable - Change onDelete behavior from CASCADE to RESTRICT for Customer relations
-- This prevents accidental deletion of instruments, invoices, and reports when a customer is deleted

-- Drop and recreate foreign key constraints with RESTRICT instead of CASCADE

-- Instrument -> Customer
ALTER TABLE "Instrument" DROP CONSTRAINT IF EXISTS "Instrument_customerId_fkey";
ALTER TABLE "Instrument" ADD CONSTRAINT "Instrument_customerId_fkey" 
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invoice -> Customer  
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_customerId_fkey";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Report -> Customer
ALTER TABLE "Report" DROP CONSTRAINT IF EXISTS "Report_customerId_fkey";
ALTER TABLE "Report" ADD CONSTRAINT "Report_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
