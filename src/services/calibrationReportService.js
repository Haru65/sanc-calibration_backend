import pkg from '@prisma/client';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const numberValue = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).replace(/\(-\)/g, '-').replace(/,/g, '').trim();
  const numeric = Number(normalized.match(/-?\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(numeric) ? numeric : null;
};

const formatNumber = (value, digits = 2) => {
  const numeric = numberValue(value);
  if (numeric === null) return value ?? '';
  return numeric.toFixed(digits).replace(/\.?0+$/, '');
};

const REQUIRED_READING_ROWS = 5;

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-GB');
};

const parseJson = (value, fallback = null) => {
  if (!value || typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const parsePoints = (instrument) => {
  const parsed = parseJson(instrument.calibrationPoints);
  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.rows)
      ? parsed.rows
      : null;

  if (rows?.length) {
    return rows.map((row) => ({
      set: row.set ?? row.master ?? row.calibrationPoint ?? row.point,
      up: row.up ?? row.standardUp ?? row.switchingUp,
      down: row.down ?? row.standardDown ?? row.switchingDown,
      unc: row.unc ?? row.uncertainty ?? instrument.readingAccuracy ?? instrument.accuracy ?? '',
    }));
  }

  const csvPoints = String(instrument.calibrationPoints || '')
    .split(',')
    .map((point) => numberValue(point))
    .filter((point) => point !== null);

  if (csvPoints.length) {
    return csvPoints.map((point) => ({
      set: point,
      unc: instrument.readingAccuracy ?? instrument.accuracy ?? '',
    }));
  }

  const start = numberValue(instrument.rangeStart) ?? 0;
  const end = numberValue(instrument.rangeEnd) ?? 100;
  const count = inferType(instrument) === 'switch' ? 3 : inferType(instrument) === 'gauge' ? 7 : 5;
  const step = count > 1 ? (end - start) / (count - 1) : 0;

  return Array.from({ length: count }, (_, index) => ({
    set: start + step * index,
    unc: instrument.readingAccuracy ?? instrument.accuracy ?? '',
  }));
};

const normalizeReadingPoints = (points, instrument, type) => {
  if (points.length >= REQUIRED_READING_ROWS) {
    return Array.from({ length: REQUIRED_READING_ROWS }, (_, index) => {
      const sourceIndex =
        REQUIRED_READING_ROWS > 1
          ? Math.round((index / (REQUIRED_READING_ROWS - 1)) * (points.length - 1))
          : 0;
      return points[Math.min(points.length - 1, sourceIndex)];
    });
  }

  const start = numberValue(instrument.rangeStart) ?? 0;
  const end = numberValue(instrument.rangeEnd);
  const fallbackEnd =
    type === 'switch'
      ? 20
      : type === 'transmitter' || type === 'humidityTemperature' || type === 'humidityHumidity'
        ? 100
        : 60;
  const resolvedEnd = end !== null && end !== start ? end : fallbackEnd;
  const step = REQUIRED_READING_ROWS > 1 ? (resolvedEnd - start) / (REQUIRED_READING_ROWS - 1) : 0;
  const normalized = [...points];

  while (normalized.length < REQUIRED_READING_ROWS) {
    const index = normalized.length;
    normalized.push({
      set: start + step * index,
      unc: instrument.readingAccuracy ?? instrument.accuracy ?? '',
    });
  }

  return normalized;
};

const inferType = (instrument) => {
  const raw = `${instrument.category || ''} ${instrument.name || ''}`.toLowerCase();
  if (raw.includes('humidity')) return 'humidity';
  if (raw.includes('switch')) return 'switch';
  if (raw.includes('transmitter')) return 'transmitter';
  if (raw.includes('gauge')) return 'gauge';
  return 'gauge';
};

const rangeText = (instrument) => {
  const start = instrument.rangeStart || '';
  const end = instrument.rangeEnd || '';
  const unit = instrument.rangeUnit || '';

  if (start || end) return `${start || '0'} to ${end || ''} ${unit}`.trim();
  return instrument.description || '';
};

const REFERENCE_READING_OFFSETS = {
  digital: {
    0.1: [0.1, 0.1, 0.2, 0.2, 0.3, 0.2],
    0.01: [0.09, 0.08, 0.07, 0.09, 0.09, 0.11],
    0.001: [0.008, 0.023, 0.065, 0.078, 0.022, 0.45],
    1: [0, 1, 1, 0, 0, 0],
  },
  analog: {
    10: [0, 0, 0, 10, 10, 20],
    0.2: [0, 0.4, 0.4, 0.6, 0.6, 0.8],
    5: [0, 5, 5, 5, 10, 10],
  },
};

const REFERENCE_NOMINALS = {
  digital: [0, 20, 40, 60, 80, 100],
  analog: [0, 200, 400, 600, 800, 1000],
};

const interpolateOffset = (nominals, offsets, value) => {
  if (!offsets?.length) return 0;
  if (value <= nominals[0]) return offsets[0] ?? 0;

  for (let index = 1; index < nominals.length; index += 1) {
    const low = nominals[index - 1];
    const high = nominals[index];

    if (value <= high) {
      const lowOffset = offsets[index - 1] ?? 0;
      const highOffset = offsets[index] ?? lowOffset;
      const ratio = high === low ? 0 : (value - low) / (high - low);
      return lowOffset + (highOffset - lowOffset) * ratio;
    }
  }

  return offsets[offsets.length - 1] ?? 0;
};

const referenceOffsetForRow = (instrument, set, start, span, converted) => {
  if (converted) return 0;

  const type = String(instrument.type || '').toLowerCase().includes('digital') ? 'digital' : 'analog';
  const resolution = numberValue(instrument.resolution);
  if (resolution === null) return 0;

  const offsets = REFERENCE_READING_OFFSETS[type]?.[resolution];
  if (!offsets?.length) return 0;

  const nominalScale = type === 'analog' ? 1000 : 100;
  const normalizedSet =
    span && span !== 0
      ? ((numberValue(set) ?? start) - start) / span * nominalScale
      : 0;

  return interpolateOffset(REFERENCE_NOMINALS[type], offsets, normalizedSet);
};

const buildRows = (instrument, typeOverride = null) => {
  const type = typeOverride || inferType(instrument);
  const start = numberValue(instrument.rangeStart) ?? 0;
  const end = numberValue(instrument.rangeEnd);
  const points = normalizeReadingPoints(parsePoints(instrument), instrument, type);
  const maxPoint = Math.max(0, ...points.map((row) => numberValue(row.set)).filter((value) => value !== null));
  const span = end !== null && end !== start ? end - start : maxPoint || 100;
  const unit = instrument.rangeUnit || '';
  const converted = type === 'transmitter' || type === 'humidityTemperature' || type === 'humidityHumidity';

  return points.map((row) => {
    const set = numberValue(row.set) ?? 0;
    const correspondingMA = converted ? 4 + (16 / span) * (set - start) : null;
    const defaultReading = converted ? correspondingMA : set;
    const referenceOffset = referenceOffsetForRow(instrument, set, start, span, converted);
    const generatedReading = defaultReading + referenceOffset;
    const up = numberValue(row.up) ?? generatedReading;
    const down = numberValue(row.down) ?? generatedReading;
    const mean = (up + down) / 2;
    const correspondingValue = converted ? (mean - 4) * (span / 16) + start : set;
    const error = converted ? correspondingValue - set : correspondingValue - mean;

    return {
      set: formatNumber(set),
      master: formatNumber(set),
      unit,
      up: formatNumber(up),
      down: formatNumber(down),
      mean: formatNumber(mean),
      correspondingMA: converted ? formatNumber(correspondingMA) : '',
      correspondingValue: converted ? formatNumber(correspondingValue) : '',
      correspondingPressure: formatNumber(correspondingValue),
      error: formatNumber(error, 4),
      unc: row.unc ?? instrument.readingAccuracy ?? instrument.accuracy ?? '',
    };
  });
};

const buildReadings = (instrument) => {
  const type = inferType(instrument);

  if (type === 'humidity') {
    return {
      tableType: 'humidity',
      sections: [
        {
          tableType: 'humidityTemperature',
          title: 'Humidity Transmitter - Temperature',
          unit: 'deg C',
          rows: buildRows(instrument, 'humidityTemperature'),
        },
        {
          tableType: 'humidityHumidity',
          title: 'Humidity Transmitter - Humidity',
          unit: '%RH',
          rows: buildRows(instrument, 'humidityHumidity'),
        },
      ],
    };
  }

  return {
    tableType: type,
    unit: instrument.rangeUnit || '',
    rangeStart: numberValue(instrument.rangeStart) ?? 0,
    highestRange: numberValue(instrument.rangeEnd),
    rows: buildRows(instrument, type),
  };
};

const DEFAULT_REFERENCE_STANDARDS = [
  {
    name: 'Multifunctional Calibrator',
    serial: '68281901172',
    cert: 'CAL-25050083/ET/01',
    reportNo: 'CAL-25050083/ET/01',
    validUpto: '12/05/2026',
  },
  {
    name: 'Digital Manometer',
    serial: '005TTW',
    cert: 'CAL-25100187/PR/03',
    reportNo: 'CAL-25100187/PR/03',
    validUpto: '17/10/2026',
  },
  {
    name: 'Digital Manometer',
    serial: '014L56',
    cert: 'CAL-25100187/PR/02',
    reportNo: 'CAL-25100187/PR/02',
    validUpto: '17/10/2026',
  },
  {
    name: 'Digital Manometer',
    serial: '005PWD',
    cert: 'CAL-25100187/PR/01',
    reportNo: 'CAL-25100187/PR/01',
    validUpto: '17/10/2026',
  },
];

const STANDARD_KEYS = {
  'ASC-400': DEFAULT_REFERENCE_STANDARDS[0],
  'CAL-25050083/ET/01': DEFAULT_REFERENCE_STANDARDS[0],
  '68281901172': DEFAULT_REFERENCE_STANDARDS[0],
  '477AV-00': DEFAULT_REFERENCE_STANDARDS[1],
  'CAL-25100187/PR/03': DEFAULT_REFERENCE_STANDARDS[1],
  '005TTW': DEFAULT_REFERENCE_STANDARDS[1],
  '477B-1': DEFAULT_REFERENCE_STANDARDS[2],
  'CAL-25100187/PR/02': DEFAULT_REFERENCE_STANDARDS[2],
  '014L56': DEFAULT_REFERENCE_STANDARDS[2],
  '477AV-2': DEFAULT_REFERENCE_STANDARDS[3],
  'CAL-25100187/PR/01': DEFAULT_REFERENCE_STANDARDS[3],
  '005PWD': DEFAULT_REFERENCE_STANDARDS[3],
};

const defaultStandardForInstrument = (instrument) => {
  const raw = `${instrument?.category || ''} ${instrument?.name || ''} ${instrument?.model || ''}`.toLowerCase();

  if (raw.includes('transmitter') || raw.includes('humidity')) {
    return DEFAULT_REFERENCE_STANDARDS[0];
  }

  if (raw.includes('gauge') || raw.includes('pressure') || raw.includes('switch')) {
    return DEFAULT_REFERENCE_STANDARDS[1];
  }

  return DEFAULT_REFERENCE_STANDARDS[0];
};

const buildStandards = (standards = []) => {
  return standards
    .map((standard) => {
      const key = String(
        standard.reportNo ||
        standard.certificateNo ||
        standard.serial ||
        standard.model ||
        standard.instrument ||
        ''
      ).toUpperCase();
      const mapped = STANDARD_KEYS[key];

      return {
        name: standard.instrument || mapped?.name || '',
        serial: standard.serial || mapped?.serial || '',
        cert: standard.certificateNo || standard.reportNo || mapped?.cert || '',
        reportNo: standard.reportNo || mapped?.reportNo || '',
        validUpto: formatDate(standard.certExpiry) || mapped?.validUpto || '',
      };
    })
    .filter((standard) => standard.name || standard.serial || standard.cert || standard.validUpto);
};

const splitStandardCodes = (value) =>
  String(value || '')
    .split(/[,;|/]+/)
    .map((item) => item.trim())
    .filter(Boolean);

export const buildReportStandards = (instrument) => {
  const linkedStandards = buildStandards(instrument?.standards || []);
  if (linkedStandards.some((standard) => standard.name && (standard.serial || standard.cert))) {
    return linkedStandards;
  }

  const codes = [
    ...splitStandardCodes(instrument?.instrumentId),
    ...splitStandardCodes(instrument?.model),
    ...splitStandardCodes(instrument?.serial),
  ];
  const seen = new Set();
  const matched = codes
    .map((code) => STANDARD_KEYS[code.toUpperCase()] || STANDARD_KEYS[code])
    .filter(Boolean)
    .filter((standard) => {
      const key = standard.reportNo || standard.cert || standard.serial || standard.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (matched.length) return matched;

  return [defaultStandardForInstrument(instrument)];
};

const nonEmpty = (...values) => {
  const found = values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
  return found ?? 'N/A';
};

const normalizeKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const itemSpecValue = (item, ...keys) => {
  const specs = Array.isArray(item.specs) ? item.specs : [];
  const normalizedKeys = keys.map(normalizeKey);
  const match = specs.find((spec) => normalizedKeys.includes(normalizeKey(spec.key)));
  return match?.value || '';
};

const itemSearchText = (item) =>
  [
    item.name,
    item.title,
    item.description,
    item.itemCode,
    ...(Array.isArray(item.specs) ? item.specs.map((spec) => spec.value) : []),
  ]
    .filter(Boolean)
    .join(' ');

const itemSearchTokens = (item) =>
  [
    item.model,
    item.itemCode,
    item.name,
    item.title,
    item.description,
    itemSpecValue(item, 'model'),
    itemSpecValue(item, 'item code'),
    itemSpecValue(item, 'serial no', 'serial number'),
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(/\s+/))
    .map((value) => value.trim())
    .filter((value) => value.length >= 3)
    .slice(0, 12);

const inferCategoryFromItem = (item) => {
  const raw = itemSearchText(item).toLowerCase();
  if (raw.includes('humidity') || raw.includes('rh')) return 'Humidity transmitter';
  if (raw.includes('switch')) return 'Switches';
  if (raw.includes('transmitter') || raw.includes(' tx') || raw.includes('-tx') || raw.includes('tx ')) return 'Transmitter';
  if (raw.includes('gauge') || raw.includes('pressure')) return 'Gauges';
  return 'Gauges';
};

const parseRangeSpec = (value) => {
  const matches = String(value || '').match(/-?\d+(?:\.\d+)?/g) || [];
  const values = matches.map(Number);
  const unit = String(value || '').replace(/[-\d.,\s]+/g, '').trim();

  return {
    start: values.length ? String(values[0]) : '',
    end: values.length ? String(Math.max(...values)) : '',
    unit,
  };
};

const buildFallbackInstrumentFromItem = async (item) => {
  const category = inferCategoryFromItem(item);
  const template = await prisma.instrument.findFirst({
    where: { category: { contains: category.split(' ')[0], mode: 'insensitive' } },
    include: { customer: true, standards: true },
  });

  if (!template) return null;

  const range = parseRangeSpec(itemSpecValue(item, 'range'));
  const itemName = item.name || item.title || item.itemName || 'ERPNext Instrument';
  const itemModel = itemSpecValue(item, 'model') || item.itemCode || itemName;

  return {
    ...template,
    name: itemName,
    make: itemSpecValue(item, 'make') || template.make,
    model: itemModel,
    serial: itemSpecValue(item, 'serial no', 'serial number') || '',
    category,
    rangeStart: range.start || template.rangeStart,
    rangeEnd: range.end || template.rangeEnd,
    rangeUnit: range.unit || template.rangeUnit,
    accuracy: itemSpecValue(item, 'accuracy') || template.accuracy,
    __fallbackTemplate: true,
  };
};

const findInstrumentForItem = async (item, instrumentId) => {
  if (instrumentId) {
    return prisma.instrument.findUnique({
      where: { id: Number(instrumentId) },
      include: { customer: true, standards: true },
    });
  }

  const text = itemSearchText(item);
  const itemName = item.name || item.title || item.itemName || '';
  const tokens = itemSearchTokens(item);
  const searchClauses = [];

  if (itemName.trim()) {
    searchClauses.push({ name: { contains: itemName, mode: 'insensitive' } });
  }

  tokens.forEach((token) => {
    searchClauses.push({ model: { contains: token, mode: 'insensitive' } });
    searchClauses.push({ name: { contains: token, mode: 'insensitive' } });
    searchClauses.push({ serial: { contains: token, mode: 'insensitive' } });
    searchClauses.push({ instrumentId: { contains: token, mode: 'insensitive' } });
  });

  if (!searchClauses.length) return null;

  const candidates = await prisma.instrument.findMany({
    where: {
      OR: searchClauses,
    },
    include: { customer: true, standards: true },
    take: 25,
  });

  const normalizedText = normalizeKey(text);
  return (
    candidates.find((instrument) => normalizeKey(instrument.model) && normalizeKey(instrument.model) === normalizeKey(itemSpecValue(item, 'model'))) ||
    candidates.find((instrument) => normalizeKey(instrument.serial) && normalizeKey(instrument.serial) === normalizeKey(itemSpecValue(item, 'serial no', 'serial number'))) ||
    candidates.find((instrument) => normalizeKey(instrument.model) && normalizedText.includes(normalizeKey(instrument.model))) ||
    candidates.find((instrument) => normalizeKey(instrument.model) && normalizeKey(instrument.model).includes(normalizeKey(itemSpecValue(item, 'model')))) ||
    candidates.find((instrument) => normalizeKey(instrument.name) && normalizedText.includes(normalizeKey(instrument.name))) ||
    candidates[0] ||
    null
  );
};

const buildCertificateNo = (invoiceNumber, instrument) =>
  `CAL-${String(invoiceNumber || 'ERP').replace(/[^\w-]+/g, '-')}-${instrument.id}`;

export const getCalibrationSourceReports = async () =>
  prisma.report.findMany({
    where: {
      type: 'test',
      invoiceId: { not: null },
    },
    include: {
      customer: true,
      invoice: true,
    },
    orderBy: { issueDate: 'desc' },
    take: 50,
  });

export const buildCalibrationReportFromErpItem = async ({ sourceReportId, itemIndex = 0, instrumentId }) => {
  const sourceReport = await prisma.report.findUnique({
    where: { id: Number(sourceReportId) },
    include: {
      customer: true,
      invoice: true,
    },
  });

  if (!sourceReport) {
    const error = new Error('Source ERPNext report not found');
    error.statusCode = 404;
    throw error;
  }

  const items = parseJson(sourceReport.items, []);
  const item = items[Number(itemIndex)] || items[0];

  if (!item) {
    const error = new Error('No purchased instrument found in this PO/invoice');
    error.statusCode = 400;
    throw error;
  }

  const instrument = await findInstrumentForItem(item, instrumentId);
  const resolvedInstrument = instrument || await buildFallbackInstrumentFromItem(item);

  if (!resolvedInstrument) {
    const error = new Error('No matching internal instrument found for selected ERPNext item');
    error.statusCode = 404;
    throw error;
  }

  const now = new Date();
  const calibrationDate = now;
  const periodMonths = numberValue(resolvedInstrument.calibrationPeriod) ?? 12;
  const dueDate = new Date(calibrationDate);
  dueDate.setMonth(dueDate.getMonth() + periodMonths);

  const certificateNo = buildCertificateNo(sourceReport.invoice?.invoiceNumber || sourceReport.tcNumber, {
    id: resolvedInstrument.__fallbackTemplate ? `ERP-${sourceReport.id}-${Number(itemIndex)}` : resolvedInstrument.id,
  });
  const refStandards = buildReportStandards(resolvedInstrument);
  const reportData = {
    type: 'calibration',
    certificateNo,
    customerId: sourceReport.customerId,
    instrumentId: resolvedInstrument.__fallbackTemplate ? null : resolvedInstrument.id,
    invoiceId: sourceReport.invoiceId,
    issueDate: now,
    status: 'Calibrated & Passed',
    calibrationDate,
    dueDate,
    location: 'Lab',
    instrumentName: nonEmpty(resolvedInstrument.name, item.name, item.title),
    instrumentMake: nonEmpty(resolvedInstrument.make, itemSpecValue(item, 'make')),
    instrumentModel: nonEmpty(resolvedInstrument.model, itemSpecValue(item, 'model'), item.itemCode),
    instrumentSerial: nonEmpty(resolvedInstrument.serial, itemSpecValue(item, 'serial no', 'serial number')),
    instrumentRange: nonEmpty(rangeText(resolvedInstrument), itemSpecValue(item, 'range')),
    instrumentResolution: nonEmpty(resolvedInstrument.resolution),
    instrumentAccuracy: nonEmpty(resolvedInstrument.accuracy, itemSpecValue(item, 'accuracy')),
    instrumentTag: nonEmpty(resolvedInstrument.instrumentId),
    conditionOnReceipt: 'Good',
    envTemperature: '25±5',
    envHumidity: '40-70',
    readings: JSON.stringify(buildReadings(resolvedInstrument)),
    refStandards: JSON.stringify(refStandards),
    customRemark: `Generated from ERPNext invoice ${sourceReport.invoice?.invoiceNumber || sourceReport.tcNumber || ''}. PO: ${sourceReport.poNumber || 'N/A'}${resolvedInstrument.__fallbackTemplate ? '. Internal category template used because no exact instrument match was found.' : ''}`,
    calibratedByName: 'Rahul Patel',
    calibratedByDesignation: 'Lab Engineer',
    approvedByName: 'Prashant Patel',
    approvedByDesignation: 'Lab Incharge',
  };

  return prisma.report.upsert({
    where: { certificateNo },
    update: reportData,
    create: reportData,
    include: {
      customer: true,
      instrument: true,
      invoice: true,
    },
  });
};
