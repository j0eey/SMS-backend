import express from "express";
import axios from "axios";

const router = express.Router();

// your bot settings
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

router.post("/", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message text required" });
    }

    const text = `
📩 *New Support Message*
👤 Name: ${name || "Anonymous"}
📧 Email: ${email || "Not provided"}
💬 Message:
${message}
    `;

    // send to Telegram
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "Markdown",
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Support message error:", err.message);
    res.status(500).json({ error: "Failed to send support message" });
  }
});

export default router;