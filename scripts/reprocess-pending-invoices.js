import dotenv from 'dotenv';

dotenv.config();

const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = Number.parseInt(limitArg?.split('=')[1] || process.env.ERP_REPROCESS_LIMIT || '500', 10);
const dryRun = process.argv.includes('--dry-run');

const { reprocessPendingErpNextInvoices } = await import('../src/controllers/erpnextController.js');

try {
  console.log(`${dryRun ? 'Checking' : 'Reprocessing'} local pending invoices against latest ${limit} ERPNext invoices...`);

  const result = await reprocessPendingErpNextInvoices({ limit, dryRun });

  console.log(JSON.stringify({
    dryRun: result.dryRun || false,
    fetchedFromErpNext: result.fetched,
    localPendingFoundInErpNext: result.matchedPending,
    repairedOrSaved: result.saved,
    stillPending: result.pending,
    calibrationReportsGenerated: result.calibrationReports,
    acknowledgedInErpNext: result.acknowledged,
    acknowledgmentFailed: result.acknowledgmentFailed,
    missingFromErpNext: result.missingFromErpNext,
    checks: result.checks,
    acknowledgmentErrors: result.acknowledgmentErrors,
  }, null, 2));
} catch (error) {
  console.error('Failed to reprocess pending invoices:', error.message);
  process.exitCode = 1;
}
