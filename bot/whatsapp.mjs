// WhatsApp Cloud API: message bhejna + Meta ki signature check.
// Brain (Groq) se jawab le kar Meta ko bhejte hain.
import crypto from "node:crypto";

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
