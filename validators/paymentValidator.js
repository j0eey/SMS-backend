import Joi from 'joi';

export const depositSchema = Joi.object({
  method: Joi.string().valid('whishmoney', 'usdt', 'binance').required(),
  amount: Joi.number().positive().required(),
  reference: Joi.string().required(),
  proof: Joi.string().optional(),
  currency: Joi.string()
    .valid('USD', 'LBP')
    .when('method', {
      is: 'whishmoney',
      then: Joi.required(),
      otherwise: Joi.forbidden()
    })
});

export const balanceAdjustSchema = Joi.object({
  amount: Joi.number().required(),
  reason: Joi.string().optional()
});
