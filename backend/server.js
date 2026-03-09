// CareLink backend – Node.js + Express (no AI APIs)

  process.env.TWILIO_ACCOUNT_SID,
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs-extra");

const app = express();
const PORT = 4000;

// ---------- MIDDLEWARE ----------
app.use(
  cors({
    origin: "http://localhost:3000", // React app on port 3000
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: false,
  })
);
app.use(express.json());

// ---------- JSON FILE HELPERS ----------

const dataDir = path.join(__dirname, "data");

async function readJson(fileName) {
  const filePath = path.join(dataDir, fileName);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data || "[]");
  } catch (err) {
    console.error(`Error reading ${fileName}:`, err.message);
    return [];
  }
}

async function writeJson(fileName, content) {
  const filePath = path.join(dataDir, fileName);
  await fs.writeFile(filePath, JSON.stringify(content, null, 2), "utf-8");
}

// ---------- BASIC HEALTH CHECK ----------

app.get("/api/ping", (req, res) => {
  res.json({ status: "ok", message: "CareLink backend running" });
});

// ---------- AUTH / REGISTRATION ----------

// Patient registration
app.post("/api/patients/register", async (req, res) => {
  const { name, phone, password, age, bloodGroup } = req.body;

  if (!name || !phone || !password) {
    return res
      .status(400)
      .json({ error: "name, phone, password are required" });
  }

  const patients = await readJson("patients.json");
  const existing = patients.find((p) => p.phone === phone);
  if (existing) {
    return res.status(409).json({ error: "Phone already registered" });
  }

  const newPatient = {
    id: "patient-" + Date.now(),
    name,
    phone,
    password, // plain text for prototype only
    age: age || null,
    bloodGroup: bloodGroup || "",
    allergies: [],
    conditions: [],
    currentMeds: [],
    lastVisit: null,
    notes: "",
    trustedContacts: [],
  };

  patients.push(newPatient);
  await writeJson("patients.json", patients);

  const { password: _, ...safePatient } = newPatient;
  res.status(201).json({ message: "Patient registered", patient: safePatient });
});

// Patient login  (USED BY FRONTEND)
app.post("/api/patients/login", async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ error: "phone and password are required" });
  }

  const patients = await readJson("patients.json");
  const patient = patients.find(
    (p) => p.phone === phone && p.password === password
  );

  if (!patient) {
    return res.status(401).json({ error: "Invalid phone or password" });
  }

  // Match what the React app expects: { patientId, name }
  res.json({
    message: "Login successful",
    patientId: patient.id,
    name: patient.name,
  });
});

// Hospital registration
app.post("/api/hospitals/register", async (req, res) => {
  const { name, email, password, location, phone } = req.body;

  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ error: "name, email, password are required" });
  }

  const hospitals = await readJson("hospitals.json");
  const existing = hospitals.find((h) => h.email === email);
  if (existing) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const newHospital = {
    id: "hospital-" + Date.now(),
    name,
    email,
    password,
    location: location || "",
    phone: phone || "",
  };

  hospitals.push(newHospital);
  await writeJson("hospitals.json", hospitals);

  const { password: _, ...safeHospital } = newHospital;
  res
    .status(201)
    .json({ message: "Hospital registered", hospital: safeHospital });
});

// Hospital login
app.post("/api/hospitals/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const hospitals = await readJson("hospitals.json");
  const hospital = hospitals.find(
    (h) => h.email === email && h.password === password
  );

  if (!hospital) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const { password: _, ...safeHospital } = hospital;
  res.json({ message: "Login successful", hospital: safeHospital });
});

// ---------- PATIENT SUMMARY FOR EMERGENCY (HOSPITAL FLOW) ----------

// Hospital enters phone -> get patient + records
app.get("/api/patients/by-phone/:phone", async (req, res) => {
  const { phone } = req.params;
  const patients = await readJson("patients.json");
  const patient = patients.find((p) => p.phone === phone);

  if (!patient) {
    return res.status(404).json({ error: "Patient not found" });
  }

  const records = await readJson("records.json");
  const patientRecords = records.filter((r) => r.patientId === patient.id);

  const { password: _, ...safePatient } = patient;

  res.json({
    patient: safePatient,
    records: patientRecords,
  });
});

// ---------- MEDICAL RECORDS CRUD ----------

// Get all records for a patient
app.get("/api/records/:patientId", async (req, res) => {
  const { patientId } = req.params;
  const records = await readJson("records.json");
  const patientRecords = records.filter((r) => r.patientId === patientId);
  res.json(patientRecords);
});

// Add new record
app.post("/api/records", async (req, res) => {
  const { patientId, date, diagnosis, tests, medicines, notes, tag } = req.body;

  if (!patientId || !date || !diagnosis) {
    return res
      .status(400)
      .json({ error: "patientId, date and diagnosis are required" });
  }

  const records = await readJson("records.json");
  const newRecord = {
    id: "rec-" + Date.now(),
    patientId,
    date,
    diagnosis,
    tests: tests || "",
    medicines: medicines || "",
    notes: notes || "",
    tag: tag || "",
  };

  records.push(newRecord);
  await writeJson("records.json", records);

  res.status(201).json({ message: "Record added", record: newRecord });
});

// Update record
app.put("/api/records/:recordId", async (req, res) => {
  const { recordId } = req.params;
  const updates = req.body;

  const records = await readJson("records.json");
  const index = records.findIndex((r) => r.id === recordId);

  if (index === -1) {
    return res.status(404).json({ error: "Record not found" });
  }

  records[index] = { ...records[index], ...updates };
  await writeJson("records.json", records);

  res.json({ message: "Record updated", record: records[index] });
});

// Delete record
app.delete("/api/records/:recordId", async (req, res) => {
  const { recordId } = req.params;
  const records = await readJson("records.json");
  const filtered = records.filter((r) => r.id !== recordId);
  await writeJson("records.json", filtered);
  res.json({ message: "Record deleted" });
});

// ---------- SOS FLOW ----------

// Patient app sends SOS + SMS to trusted contacts
app.post("/api/sos", async (req, res) => {
  const { patientId, latitude, longitude, note } = req.body;

  if (!patientId) {
    return res.status(400).json({ error: "patientId is required" });
  }

  // 1) Save SOS event
  const sosEvents = await readJson("sosEvents.json");
  const newEvent = {
    id: "sos-" + Date.now(),
    patientId,
    latitude: latitude || null,
    longitude: longitude || null,
    note: note || "",
    time: new Date().toISOString(),
  };

  sosEvents.push(newEvent);
  await writeJson("sosEvents.json", sosEvents);

  // 2) Load patient + trusted contacts
  const patients = await readJson("patients.json");
  const patient = patients.find((p) => p.id === patientId);

  let contacts = [];
  if (patient && Array.isArray(patient.trustedContacts)) {
    contacts = patient.trustedContacts;
  }

  console.log("SOS from patient:", patientId, "contacts:", contacts);

  // 3) Build SMS text
  const locationText =
    latitude && longitude
      ? `Location: https://www.google.com/maps?q=${latitude},${longitude}`
      : "Location not available.";

  const smsBody =
    `⚠️ CareLink SOS Alert\n` +
    `Patient: ${patient ? patient.name : patientId}\n` +
    `Time: ${newEvent.time}\n` +
    `Note: ${note || "No extra info."}\n` +
    `${locationText}`;

  // 4) Send SMS to each contact (demo)
  for (const c of contacts) {
    try {
      console.log("Sending SMS to", c.name, c.phone);
      await smsClient.messages.create({
        from: process.env.TWILIO_FROM_NUMBER, // must be your Twilio number
        to: c.phone, // e.g. +91xxxxxxxxxx
        body: smsBody,
      });
    } catch (err) {
      console.error("Error sending SMS to", c.phone, err.message);
      // Don't fail entire request if one contact fails
    }
  }

  res.status(201).json({
    message:
      "SOS recorded. SMS alerts attempted to all trusted contacts (see backend logs).",
    event: newEvent,
    contactsNotified: contacts.map((c) => c.phone),
  });
});

// List SOS events
app.get("/api/sos", async (req, res) => {
  const sosEvents = await readJson("sosEvents.json");
  res.json(sosEvents);
});

// ---------- START SERVER ----------
app.listen(PORT, () => {
  console.log(`✅ CareLink backend running on http://localhost:${PORT}`);
});
