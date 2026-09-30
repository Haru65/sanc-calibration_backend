import Joi from 'joi';

const imageDataUrl = Joi.string()
  .pattern(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
  .max(4_000_000)
  .allow(null, '');

export const updateCertificateSettingsSchema = Joi.object({
  email: Joi.string().trim().email().max(254).required(),
  contactNumber: Joi.string().trim().max(30).required(),
  calibratedByName: Joi.string().trim().max(100).required(),
  calibratedBySignature: imageDataUrl.optional(),
  approvedByName: Joi.string().trim().max(100).required(),
  approvedBySignature: imageDataUrl.optional(),
});
