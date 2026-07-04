import logger from '../config/logger.js';

export const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const messages = error.details.map(detail => detail.message);
      logger.warn('Validation error:', messages);
      return res.status(400).json({ errors: messages });
    }
    
    req.validated = value;
    next();
  };
};

export const handleErrors = (err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
};
