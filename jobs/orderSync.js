import cron from 'node-cron';
import Order from '../models/Order.js';
import { secsers } from '../utils/secsersApi.js';
import Notification from '../models/Notification.js';
import { sendMail } from '../utils/mailer.js';
import User from '../models/User.js';

function startOrderSync() {
  cron.schedule('*/5 * * * *', async () => {
    console.log('🔄 Running order sync job...');
    try {
      const orders = await Order.find({ status: { $in: ['Pending', 'In progress'] } });

      for (const order of orders) {
        if (!order.providerOrder) continue;

        try {
          const st = await secsers.status(order.providerOrder);

          if (st && st.status && st.status !== order.status) {
            const oldStatus = order.status;
            order.status = st.status;
            if (st.charge) order.charge = st.charge;
            if (st.start_count) order.start_count = Number(st.start_count);
            if (st.remains) order.remains = Number(st.remains);
            if (st.currency) order.currency = st.currency;
            await order.save();

            console.log(`✅ Updated order ${order.id}: ${oldStatus} -> ${order.status}`);

            // Notify user about status change
            const user = await User.findById(order.userId);
            if (user) {
              const title = `Order #${order.id} status updated`;
              const message = `Your order for service ${order.service} has changed from ${oldStatus} to ${order.status}.`;

              await Notification.create({
                userId: user._id,
                title,
                message
              });

              await sendMail(
                user.email,
                `Order Status Updated`,
                message,
                `<p>${message}</p>`
              );
            }
          }
        } catch (err) {
          console.error(`⚠️ Failed to update order ${order.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('❌ Order sync job error:', err.message);
    }
  });
}

export default startOrderSync;
