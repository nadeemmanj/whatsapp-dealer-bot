// Express server: WhatsApp-style UI + /api/chat + Meta WhatsApp webhook (/webhook)
// Local (PC): node server.mjs — Vercel: api/index.js se export hota hai
import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chat } from "./bot/brain.mjs";
import { sendWhatsAppText, markAsRead, verifySignature } from "./bot/whatsapp.mjs";
import { getLeads, getBookings, mongoStatus } from "./bot/store.mjs";

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

// --- Admin page: leads + bookings dekho (dealer subah yahan check kare) ---
// Guard: ?key= ADMIN_KEY ho (warna VERIFY_TOKEN). Dono set nahi hain to local par khula hai.
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
app.get("/admin", async (req, res) => {
  const key = process.env.ADMIN_KEY || process.env.VERIFY_TOKEN;
  if (key && req.query.key !== key) return res.status(401).send("Unauthorized — URL mein ?key= chahiye.");
  const [ls, bs] = await Promise.all([getLeads(50), getBookings(50)]);
  const status = mongoStatus();
  const statusText = status === "connected"
    ? "MongoDB connected ✅ — leads hamesha mehfooz hain"
    : status === "failed"
      ? "MongoDB connect fail ⚠️ — sirf is session ki memory dikh rahi hai"
      : "MongoDB set nahi ⚠️ — sirf is session ki memory dikh rahi hai (MONGODB_URI lagao)";
  const leadRows = ls.map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.phone)}</td><td>${esc(l.budget)}</td><td>${esc(l.area)}</td><td>${esc(l.note)}</td><td>${esc((l.at || "").slice(0, 16).replace("T", " "))}</td></tr>`).join("") || `<tr><td colspan="6">Abhi koi lead nahi.</td></tr>`;
  const bookRows = bs.map((b) => `<tr><td>${esc(b.name)}</td><td>${esc(b.phone)}</td><td>${esc(b.listing_id)}</td><td>${esc(b.date)}</td><td>${esc(b.time)}</td><td>${esc((b.at || "").slice(0, 16).replace("T", " "))}</td></tr>`).join("") || `<tr><td colspan="6">Abhi koi booking nahi.</td></tr>`;
  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chaudhry Estate — Leads &amp; Bookings</title><style>
body{font-family:system-ui,Arial,sans-serif;background:#f1f5f9;margin:0;color:#1e293b}
header{background:#6d28d9;color:#fff;padding:18px 24px}header h1{margin:0;font-size:20px}header p{margin:4px 0 0;opacity:.9;font-size:13px}
main{max-width:960px;margin:24px auto;padding:0 16px}.card{background:#fff;border-radius:12px;padding:16px 20px;margin-bottom:20px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
h2{margin:0 0 12px;font-size:16px}.status{font-size:13px;color:#475569;margin-bottom:6px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:8px;border-bottom:1px solid #e2e8f0}
th{color:#6d28d9;font-size:12px;text-transform:uppercase}
</style></head><body><header><h1>🏠 Chaudhry Estate — Leads &amp; Bookings</h1><p>${esc(statusText)}</p></header>
<main><div class="card"><h2>Leads (${ls.length})</h2><table><tr><th>Name</th><th>Phone</th><th>Budget</th><th>Area</th><th>Note</th><th>Time</th></tr>${leadRows}</table></div>
<div class="card"><h2>Bookings (${bs.length})</h2><table><tr><th>Name</th><th>Phone</th><th>Listing</th><th>Date</th><th>Time</th><th>Saved</th></tr>${bookRows}</table></div></main></body></html>`);
});

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
// Vercel serverless par: pehle poora kaam karo (reply bhej do), phir 200 OK do.
// (Response ke baad serverless function freeze ho sakta hai, is liye 200 pehle nahi.)
app.post("/webhook", async (req, res) => {
  try {
    if (!verifySignature(req.rawBody, req.headers["x-hub-signature-256"])) {
      console.log("[webhook] galat signature — ignore");
      return res.sendStatus(403);
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
  // Error ho bhi jaye to 200 do taake Meta dobara na bheje
  res.sendStatus(200);
});

// Vercel par serverless function khud listen nahi karta — sirf local par suno
if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`WhatsApp Dealer Bot demo chal raha hai: http://localhost:${PORT}`);
    console.log("Roko: Ctrl+C");
  });
}

export default app;
