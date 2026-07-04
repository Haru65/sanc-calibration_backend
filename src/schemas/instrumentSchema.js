import Joi from 'joi';

export const createInstrumentSchema = Joi.object({
  name: Joi.string().required(),
  serial: Joi.string().required(),
  make: Joi.string().required(),
  model: Joi.string().required(),
  category: Joi.string().required(),
  customerId: Joi.number().required(),
  dueDate: Joi.date().optional().allow('', null),
  ignored: Joi.boolean().optional().default(false),
  
  // Additional instrument fields
  series: Joi.string().optional().allow('', null),
  rangeStart: Joi.string().optional().allow('', null),
  rangeEnd: Joi.string().optional().allow('', null),
  rangeUnit: Joi.string().optional().allow('', null),
  accuracy: Joi.string().optional().allow('', null),
  accuracyType: Joi.string().optional().allow('', null),
  resolution: Joi.string().optional().allow('', null),
  type: Joi.string().optional().allow('', null),
  instrumentId: Joi.string().optional().allow('', null),
  calibrationPoints: Joi.string().optional().allow('', null),
  readingAccuracy: Joi.string().optional().allow('', null),
  description: Joi.string().optional().allow('', null),
  calibrationPeriod: Joi.string().optional().allow('', null)
});

export const updateInstrumentSchema = Joi.object({
  name: Joi.string().optional(),
  serial: Joi.string().optional(),
  make: Joi.string().optional(),
  model: Joi.string().optional(),
  category: Joi.string().optional(),
  customerId: Joi.number().optional(),
  dueDate: Joi.date().optional().allow('', null),
  ignored: Joi.boolean().optional(),
  
  // Additional instrument fields
  series: Joi.string().optional().allow('', null),
  rangeStart: Joi.string().optional().allow('', null),
  rangeEnd: Joi.string().optional().allow('', null),
  rangeUnit: Joi.string().optional().allow('', null),
  accuracy: Joi.string().optional().allow('', null),
  accuracyType: Joi.string().optional().allow('', null),
  resolution: Joi.string().optional().allow('', null),
  type: Joi.string().optional().allow('', null),
  instrumentId: Joi.string().optional().allow('', null),
  calibrationPoints: Joi.string().optional().allow('', null),
  readingAccuracy: Joi.string().optional().allow('', null),
  description: Joi.string().optional().allow('', null),
  calibrationPeriod: Joi.string().optional().allow('', null)
});
