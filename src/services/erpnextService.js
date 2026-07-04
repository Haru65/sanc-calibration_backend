const DEFAULT_BASE_URL = 'https://aits-sancpl.m.frappe.cloud/api';

const trimSlash = (value = '') => value.replace(/\/+$/, '');

const getErpConfig = () => ({
  baseUrl: trimSlash(process.env.ERPNEXT_BASE_URL || DEFAULT_BASE_URL),
  apiKey: process.env.ERPNEXT_API_KEY || '',
  apiSecret: process.env.ERPNEXT_API_SECRET || '',
  authScheme: (process.env.ERPNEXT_AUTH_SCHEME || 'basic').toLowerCase(),
});

const buildAuthHeader = ({ apiKey, apiSecret, authScheme = 'basic' }) => {
  if (!apiKey || !apiSecret) return null;

  if (authScheme === 'token') {
    return `token ${apiKey}:${apiSecret}`;
  }

  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;
};

const authSchemeAttempts = (authScheme = 'basic') => {
  if (authScheme === 'auto') return ['basic', 'token'];
  return authScheme === 'token' ? ['token', 'basic'] : ['basic', 'token'];
};

const erpFetch = async (path, options = {}) => {
  const config = getErpConfig();
  const attempts = authSchemeAttempts(config.authScheme);

  if (!buildAuthHeader({ ...config, authScheme: attempts[0] })) {
    const error = new Error('ERPNext API credentials are not configured');
    error.statusCode = 500;
    throw error;
  }

  let lastUnauthorizedError = null;

  for (const authScheme of attempts) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.ERPNEXT_TIMEOUT_MS || 12000));

    try {
      const response = await fetch(`${config.baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: buildAuthHeader({ ...config, authScheme }),
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
        },
      });

      const text = await response.text();
      let payload = null;

      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = { raw: text };
        }
      }

      if (!response.ok) {
        const error = new Error(payload?.exception || payload?.message || response.statusText || 'ERPNext request failed');
        error.statusCode = response.status;
        error.payload = payload;

        if (response.status === 401 && authScheme !== attempts[attempts.length - 1]) {
          lastUnauthorizedError = error;
          continue;
        }

        throw error;
      }

      return { response, payload };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastUnauthorizedError || new Error('ERPNext request failed');
};

const firstValue = (...values) => {
  const found = values.find((value) => value !== undefined && value !== null && value !== '');
  return found ?? '';
};

const stripHtml = (value = '') => String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const extractDescriptionValue = (description = '', label = '') => {
  const plain = stripHtml(description);
  const pattern = new RegExp(`${label}\\s*:?\\s*([^,;|]+)`, 'i');
  return plain.match(pattern)?.[1]?.trim() || '';
};

const extractPhone = (value = '') =>
  stripHtml(value).match(/Phone:\s*([^E]+?)(?:Email:|GSTIN:|$)/i)?.[1]?.trim() || '';

const extractEmail = (value = '') =>
  stripHtml(value).match(/Email:\s*([^\s]+@[^\s]+)/i)?.[1]?.trim() || '';

const normalizeItem = (item = {}) => ({
  itemCode: firstValue(item.item_code, item.code, item.title, item.name),
  itemName: firstValue(item.item_name, item.name, item.title, item.description),
  description: firstValue(stripHtml(item.description), item.item_name, item.title),
  quantity: firstValue(item.qty, item.quantity, item.stock_qty),
  make: firstValue(item.make, item.custom_make, item.brand, extractDescriptionValue(item.description, 'make')),
  model: firstValue(item.model, item.custom_model, extractDescriptionValue(item.description, 'model')),
  range: firstValue(item.range, item.custom_range, extractDescriptionValue(item.description, 'range')),
  accuracy: firstValue(item.accuracy, item.custom_accuracy, extractDescriptionValue(item.description, 'accuracy')),
  serialNumber: firstValue(item.serial_no, item.serial_number, item.custom_serial_no),
});

const normalizeInvoice = (invoice = {}) => {
  const items = Array.isArray(invoice.items) ? invoice.items.map(normalizeItem) : [];
  const address = stripHtml(invoice.address_display);
  const totalQuantity = items.reduce((sum, item) => {
    const qty = Number(item.quantity);
    return sum + (Number.isFinite(qty) ? qty : 0);
  }, 0);

  return {
    id: invoice.name || invoice.number,
    poNumber: firstValue(invoice.po_no, invoice.po, invoice.purchase_order, invoice.custom_po_no),
    poDate: firstValue(invoice.po_date, invoice.purchase_date, invoice.transaction_date),
    customer: firstValue(invoice.customer_name, invoice.customer),
    customerName: firstValue(invoice.customer_name, invoice.customer),
    customerAddress: firstValue(address, invoice.customer_address),
    customerPhone: firstValue(invoice.contact_mobile, invoice.contact_phone, invoice.mobile_no, extractPhone(address)),
    customerEmail: firstValue(invoice.contact_email, invoice.email_id, extractEmail(address)),
    gstin: firstValue(invoice.billing_address_gstin, invoice.gstin, invoice.tax_id),
    invoiceNumber: firstValue(invoice.name, invoice.number),
    invoiceDate: firstValue(invoice.posting_date, invoice.date),
    status: firstValue(invoice.workflow_state, invoice.status, invoice.docstatus),
    workflowState: firstValue(invoice.workflow_state),
    customIntegrated: firstValue(invoice.custom_integrated),
    amount: Number(firstValue(invoice.grand_total, invoice.rounded_total, invoice.total)) || null,
    items,
    itemCount: items.length,
    totalQuantity,
  };
};

export const getApprovedPendingInvoices = async ({ limit = 50 } = {}) => {
  const listBody = {
    doctype: 'Sales Invoice',
    filters: [
      ['custom_integrated', '=', 0],
      ['docstatus', '=', 1],
      ['workflow_state', '=', 'Approved'],
    ],
    fields: ['name', 'custom_integrated', 'workflow_state', 'posting_date', 'customer', 'customer_name', 'po_no', 'po_date'],
    limit_page_length: Number(limit) || 50,
    order_by: 'posting_date desc',
  };

  const { payload: listPayload } = await erpFetch('/method/frappe.client.get_list', {
    method: 'POST',
    body: JSON.stringify(listBody),
  });

  const invoiceRefs = Array.isArray(listPayload?.message) ? listPayload.message : [];

  const invoices = await Promise.all(
    invoiceRefs.map(async (invoiceRef) => {
      const invoiceName = invoiceRef.name || invoiceRef.invoiceNumber || invoiceRef.number;
      if (!invoiceName) return normalizeInvoice(invoiceRef);

      const { payload: detailPayload } = await erpFetch(`/resource/Sales%20Invoice/${encodeURIComponent(invoiceName)}`);
      return normalizeInvoice({ ...invoiceRef, ...(detailPayload?.data || detailPayload?.message || {}) });
    })
  );

  return {
    purchaseOrders: invoices,
    invoices,
    count: invoices.length,
  };
};

export const checkErpNextHealth = async () => {
  const started = Date.now();
  await erpFetch('/method/frappe.client.get_list', {
    method: 'POST',
    body: JSON.stringify({
      doctype: 'Sales Invoice',
      fields: ['name'],
      limit_page_length: 1,
    }),
  });

  return {
    status: 'ok',
    latencyMs: Date.now() - started,
  };
};
