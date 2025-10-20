import axios from 'axios';

const API_URL = process.env.SECSERS_API_URL || 'https://secsers.com/api/v2';

function call(action, params = {}) {
  const API_KEY = process.env.SECSERS_API_KEY;
  
  const stringified = Object.fromEntries(
    Object.entries(params).map(([k,v]) => [k, String(v)])
  );
  
  const body = new URLSearchParams({ key: API_KEY, action, ...stringified });
  return axios.post(API_URL, body).then(r => r.data);
}

export const secsers = {
  services: () => call('services'),
  add: (p) => call('add', p),
  status: (order) => call('status', { order }),
  statusMany: (ordersCsv) => call('status', { orders: ordersCsv }),
  refill: (order) => call('refill', { order }),
  refillStatus: (refill) => call('refill_status', { refill }),
  balance: () => call('balance')
};
