import Joi from 'joi';

export const createOrderSchema = Joi.object({
  service: Joi.alternatives().try(Joi.number(), Joi.string()).required(),
  quantity: Joi.number().positive().required(),
  runs: Joi.number().optional(),
  interval: Joi.number().optional(),
  provider: Joi.string().valid('manual').default('manual'),
});