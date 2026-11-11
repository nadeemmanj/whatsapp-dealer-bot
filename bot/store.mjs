// Store: leads + bookings — MongoDB (agar MONGODB_URI ho) warna memory + leads.json.
// v5.3: MongoDB Atlas persistence (Vercel par file save nahi hoti — is liye DB zaroori).
// MONGODB_URI nahi hai to purana behavior: memory + leads.json (local demo).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEADS_FILE = path.join(__dirname, "..", "leads.json");

export const leads = [];
export const bookings = [];

// --- MongoDB (lazy, cached — Vercel serverless ke liye) ---
let mongoState = "off"; // off | connecting | on | failed
let mongoPromise = null;

const leadSchema = new mongoose.Schema({
  name: String, phone: String, budget: String, area: String, note: String,
  at: { type: Date, default: Date.now },
});
const bookingSchema = new mongoose.Schema({
  name: String, phone: String, listing_id: String, date: String, time: String,
  at: { type: Date, default: Date.now },
});
const Lead = mongoose.models.Lead || mongoose.model("Lead", leadSchema);
const Booking = mongoose.models.Booking || mongoose.model("Booking", bookingSchema);

async function getMongo() {
  if (mongoState === "on") return true;
  if (mongoState === "failed") return false;
  if (!process.env.MONGODB_URI) { mongoState = "off"; return false; }
  if (!mongoPromise) {
    mongoState = "connecting";
    mongoPromise = mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      bufferCommands: false,
    }).then(() => { mongoState = "on"; console.log("[store] MongoDB connected"); return true; })
      .catch((e) => { mongoState = "failed"; console.log("[store] MongoDB connect fail — memory fallback:", e.message); return false; });
  }
  return mongoPromise;
}

export function mongoStatus() {
  if (!process.env.MONGODB_URI) return "not-configured";
  if (mongoState === "on") return "connected";
  if (mongoState === "failed") return "failed";
  return "not-connected";
}

function persist() {
  try {
    fs.writeFileSync(LEADS_FILE, JSON.stringify({ leads, bookings }, null, 2));
  } catch {
    /* Vercel par file read-only hai — ignore */
  }
}

export async function saveLead({ name, phone, budget, area, note }) {
  const lead = { name, phone, budget: budget || "", area: area || "", note: note || "", at: new Date().toISOString() };
  leads.push(lead);
  persist();
  if (await getMongo()) {
    try { await Lead.create(lead); } catch (e) { console.log("[store] lead Mongo save fail:", e.message); }
  }
  return lead;
}

export async function saveBooking({ name, phone, listing_id, date, time }) {
  const b = { name, phone, listing_id, date, time, at: new Date().toISOString() };
  bookings.push(b);
  persist();
  if (await getMongo()) {
    try { await Booking.create(b); } catch (e) { console.log("[store] booking Mongo save fail:", e.message); }
  }
  return b;
}

export async function getLeads(limit = 50) {
  if (await getMongo()) {
    try {
      const rows = await Lead.find().sort({ at: -1 }).limit(limit).lean();
      return rows.map((r) => ({ ...r, at: r.at instanceof Date ? r.at.toISOString() : r.at }));
    } catch (e) { console.log("[store] leads read fail:", e.message); }
  }
  return [...leads].reverse().slice(0, limit);
}

export async function getBookings(limit = 50) {
  if (await getMongo()) {
    try {
      const rows = await Booking.find().sort({ at: -1 }).limit(limit).lean();
      return rows.map((r) => ({ ...r, at: r.at instanceof Date ? r.at.toISOString() : r.at }));
    } catch (e) { console.log("[store] bookings read fail:", e.message); }
  }
  return [...bookings].reverse().slice(0, limit);
}
