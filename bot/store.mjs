// Simple in-memory store (+ leads.json file mein save hota hai taake demo mein dikh sake)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEADS_FILE = path.join(__dirname, "..", "leads.json");

export const leads = [];
export const bookings = [];

function persist() {
  try {
    fs.writeFileSync(LEADS_FILE, JSON.stringify({ leads, bookings }, null, 2));
  } catch {
    /* demo: ignore */
  }
}

export function saveLead({ name, phone, budget, area, note }) {
  const lead = { name, phone, budget: budget || "", area: area || "", note: note || "", at: new Date().toISOString() };
  leads.push(lead);
  persist();
  return lead;
}

export function saveBooking({ name, phone, listing_id, date, time }) {
  const b = { name, phone, listing_id, date, time, at: new Date().toISOString() };
  bookings.push(b);
  persist();
  return b;
}
