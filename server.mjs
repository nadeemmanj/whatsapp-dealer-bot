// Express server: WhatsApp-style UI + /api/chat + Meta WhatsApp webhook (/webhook)
import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chat } from "./bot/brain.mjs";
import { sendWhatsAppText, markAsRead, verifySignature } from "./bot/whatsapp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// rawBody save karte hain taake Meta ki signature verify ho sake
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: "message khaali hai" });
    }
    const reply = await chat(sessionId || "demo", String(message).trim());
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: e.message || "bot error" });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

// --- Meta webhook verification (GET) ---
// Meta jab webhook lagata hai to ye check karta hai: hub.mode + verify_token + challenge
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (process.env.VERIFY_TOKEN && mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("[webhook] verified OK");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// --- Meta se incoming WhatsApp messages (POST) ---
// Ek hi message dobara aaye to ignore karo (Meta kabhi redeliver karta hai)
const seenMessages = new Set();
app.post("/webhook", (req, res) => {
  // Pehle foran 200 OK — Meta ko jawab do, phir background mein process karo
  res.sendStatus(200);

  (async () => {
    try {
      if (!verifySignature(req.rawBody, req.headers["x-hub-signature-256"])) {
        console.log("[webhook] galat signature — ignore");
        return;
      }
      const value = req.body?.entry?.[0]?.changes?.[0]?.value;
      const messages = value?.messages || [];
      for (const m of messages) {
        if (m.type !== "text" || !m.text?.body) continue;
        if (seenMessages.has(m.id)) continue;
        seenMessages.add(m.id);
        if (seenMessages.size > 1000) seenMessages.clear();
        const from = m.from; // customer ka number — yehi sessionId hai
        console.log(`[webhook] ${from}: ${m.text.body}`);
        try { await markAsRead(m.id); } catch {}
        const reply = await chat(from, m.text.body.trim());
        await sendWhatsAppText(from, reply);
        console.log(`[webhook] reply bheja → ${from}`);
      }
    } catch (e) {
      console.log("[webhook] error:", e.message);
    }
  })();
});

app.listen(PORT, () => {
  console.log(`WhatsApp Dealer Bot demo chal raha hai: http://localhost:${PORT}`);
  console.log("Roko: Ctrl+C");
});
