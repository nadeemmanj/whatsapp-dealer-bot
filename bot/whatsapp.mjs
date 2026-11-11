// WhatsApp Cloud API: message bhejna + Meta ki signature check.
// Brain (Groq) se jawab le kar Meta ko bhejte hain.
// v5.3: dealer alert — nayi lead/booking par dealer ko WhatsApp alert.
import crypto from "node:crypto";
import { dealer } from "../data/dealer.js";

const API_VERSION = "v20.0";
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} set nahi hai — .env mein likho.`);
  return v;
}

// Customer ko text message bhejo.
// (Customer ke message ke baad 24h window mein free-form text chalta hai.)
export async function sendWhatsAppText(to, text) {
  const url = `${GRAPH}/${env("WHATSAPP_PHONE_NUMBER_ID")}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("WHATSAPP_TOKEN")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`WhatsApp send failed (${res.status}): ${data?.error?.message || "unknown error"}`);
  }
  return data;
}

// Message ko "read" mark karo (customer ko blue tick dikhta hai)
export async function markAsRead(messageId) {
  const url = `${GRAPH}/${env("WHATSAPP_PHONE_NUMBER_ID")}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("WHATSAPP_TOKEN")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  });
  if (!res.ok) console.log("[whatsapp] mark-read failed:", res.status);
}

// Pakistan number ko international format mein badlo: 0300-1234567 -> 923001234567
export function normalizeNumber(n) {
  const d = String(n || "").replace(/\D/g, "");
  if (d.startsWith("92")) return d;
  if (d.startsWith("0")) return "92" + d.slice(1);
  if (d.length === 10 && d.startsWith("3")) return "92" + d;
  return d;
}

// Dealer ko nayi lead/booking ki alert bhejo.
// Number: DEALER_ALERT_NUMBER env (jaise 923180443543), warna dealer.js wala phone.
// NOTE: test number se sirf Meta par registered numbers ko message ja sakta hai,
// aur free-form text sirf us waqt chalta hai jab us number ne aakhri 24h mein
// test number ko message bheja ho — demo mein dealer alert apne number par lo.
export async function sendDealerAlert(text) {
  const to = normalizeNumber(process.env.DEALER_ALERT_NUMBER || dealer.phone);
  return sendWhatsAppText(to, text);
}

// Meta ki signature check — sirf tab jab WHATSAPP_APP_SECRET set ho.
// (Secret nahi hai to check skip hota hai — test mode ke liye theek hai.)
export function verifySignature(rawBody, signature) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true;
  if (!signature || !rawBody) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
