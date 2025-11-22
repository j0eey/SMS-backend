    import axios from "axios";

export async function sendTelegramAlert(message) {
  try {
    const token = process.env.TELEGRAM_ALERT_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_ALERT_CHAT_ID;

    if (!token || !chatId) {
      console.warn("⚠️ Telegram alert bot not configured");
      return;
    }

    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: "Markdown",
    });

    console.log("📨 Telegram alert sent!");
  } catch (err) {
    console.error("❌ Failed to send Telegram alert:", err.message);
  }
}