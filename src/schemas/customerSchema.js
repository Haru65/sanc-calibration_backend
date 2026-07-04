import Joi from 'joi';

export const createCustomerSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().optional().allow('', null),
  phone: Joi.string().required(),
  address: Joi.string().optional().allow('', null),
  gstin: Joi.string().optional().allow('', null),
  ignored: Joi.boolean().optional().default(false)
});

export const updateCustomerSchema = Joi.object({
  name: Joi.string().optional(),
  email: Joi.string().email().optional().allow('', null),
  phone: Joi.string().optional().allow(''),
  address: Joi.string().optional().allow('', null),
  gstin: Joi.string().optional().allow('', null),
  ignored: Joi.boolean().optional()
});
