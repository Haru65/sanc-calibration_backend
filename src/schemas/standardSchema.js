import Joi from 'joi';

export const createStandardSchema = Joi.object({
  instrumentId: Joi.number().allow(null).optional(),
  instrument: Joi.string().required(),
  calibrationDate: Joi.string().allow('', null).optional(),
  reportNo: Joi.string().allow('', null).optional(),
  certificateNo: Joi.string().required(),
  certExpiry: Joi.string().allow('', null).optional(),
  make: Joi.string().allow('', null).optional(),
  serial: Joi.string().allow('', null).optional(),
  range: Joi.string().allow('', null).optional(),
  accuracy: Joi.string().allow('', null).optional()
});

export const updateStandardSchema = Joi.object({
  instrumentId: Joi.number().optional(),
  instrument: Joi.string().optional(),
  calibrationDate: Joi.string().allow('', null).optional(),
  reportNo: Joi.string().allow('', null).optional(),
  certificateNo: Joi.string().optional(),
  certExpiry: Joi.string().allow('', null).optional(),
  make: Joi.string().allow('', null).optional(),
  serial: Joi.string().allow('', null).optional(),
  range: Joi.string().allow('', null).optional(),
  accuracy: Joi.string().allow('', null).optional()
});
