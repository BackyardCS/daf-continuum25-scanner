/* ========================
   Configuration
======================== */
const ENDPOINT = "https://script.google.com/macros/s/AKfycbzXfi5rsmFvOn-BVcSd6FpY3xLPUf8rQ__om2Occba5WFzxq2pknsM38OtTi96sg_tD5Q/exec"; // e.g., https://script.google.com/macros/s/XXX/exec

// IMPORTANT: Set this to match your Sheet's meaning of "guests":
// true  => Sheet's "guests" = companions only (NOT including the main guest)
// false => Sheet's "guests" = total people (main guest included)
const GUESTS_FIELD_IS_ADDITIONAL = true;

/* ========================
   State
======================== */
let qr = null;
let isRunning = false;
let lastCode = null;
let lastAllowed = false;

// Web Audio (beep)
let audioCtx = null;

/* ========================
   Helpers
======================== */
const $ = (sel) => document.querySelector(sel);

const setStatus = (msg, cls = "") => {
  const el = $("#status");
  el.className = `status ${cls}`.trim();
  el.textContent = msg;
  // persists
};

const setBadgeTotal = (n) => { $("#guestCount").textContent = String(n ?? 0); };
const setAttendee = (name) => { $("#attendee").textContent = name && String(name).trim() ? String(name).trim() : "—"; };
const setCompanions = (n) => { $("#companions").textContent = Number.isFinite(n) ? String(n) : "0"; };
const enableConfirm = (on) => { $("#confirmBtn").disabled = !on; };

function beep(duration = 120, freq = 880, type = "sine") {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0.07;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); }, duration);
  } catch (_) {}
}

function buzz(ms = 50) {
  if (navigator.vibrate) try { navigator.vibrate(ms); } catch(_) {}
}

// Extract name from flexible API fields
function extractName(data) {
  const keys = ['name','full_name','fullname','Name','Full Name'];
  for (const k of keys) {
    const v = data?.[k];
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return "";
}

// Extract raw guests value from flexible API fields
function extractGuestsRaw(data) {
  const keys = ['guests','guest_count','companions','num_guests','attendees','total_guests','Total Guests'];
  for (const k of keys) {
    const v = data?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      const n = Number(v);
      if (!isNaN(n)) return n;
    }
  }
  return 0;
}

// Convert raw guests to companions + total entering
function normalizeGuests(raw) {
  const companions = GUESTS_FIELD_IS_ADDITIONAL ? raw : Math.max(Number(raw) - 1, 0);
  const total = GUESTS_FIELD_IS_ADDITIONAL ? Number(raw) + 1 : Number(raw);
  return { companions, total };
}

/* ========================
   Scanner start/stop
======================== */
async function startScanner() {
  if (isRunning) return;

  enableConfirm(false);
  setStatus("Starting camera…");

  const cfg = {
    fps: 10,
    qrbox: { width: 420, height: 420 }, // match CSS frame
    aspectRatio: 1.0
  };

  if (!qr) qr = new Html5Qrcode("reader");

  try {
    // Permission nudge (esp. iOS Safari)
    const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
    tmp.getTracks().forEach(t => t.stop());

    // Prefer rear camera
    await qr.start({ facingMode: { exact: "environment" } }, cfg, onScan, onFail);
    isRunning = true;
    $("#scanBtn").textContent = "Stop";
    setStatus("Scanning…");
    return;
  } catch (_) {
    // fallback
  }

  try {
    const devices = await Html5Qrcode.getCameras();
    const rear = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[0];
    if (!rear) throw new Error("No cameras found");
    await qr.start({ deviceId: { exact: rear.id } }, cfg, onScan, onFail);
    isRunning = true;
    $("#scanBtn").textContent = "Stop";
    setStatus("Scanning…");
  } catch (err) {
    console.error(err);
    setStatus("Camera unavailable. Check HTTPS and camera permissions for this site.", "bad");
  }
}

async function stopScanner() {
  if (!qr || !isRunning) {
    $("#scanBtn").textContent = "Scan";
    return;
  }
  try { await qr.stop(); } catch {}
  isRunning = false;
  $("#scanBtn").textContent = "Scan";
}

/* ========================
   Scan handlers
======================== */
async function onScan(decodedText) {
  // Capture & stop the camera immediately
  lastCode = (decodedText || "").trim();
  await stopScanner();

  // Feedback: beep + vibration
  beep(120, 880, "sine");
  buzz(50);

  setStatus(`Scanned: ${lastCode}`);

  // Validate against your API
  try {
    const res = await fetch(`${ENDPOINT}?code=${encodeURIComponent(lastCode)}`, {
      credentials: "omit", cache: "no-store",
    });
    const data = await res.json();

    // Always show name + guests regardless of status
    const name = extractName(data);
    const rawGuests = extractGuestsRaw(data);
    const { companions, total } = normalizeGuests(rawGuests);

    setAttendee(name);
    setCompanions(companions);
    setBadgeTotal(total);

    lastAllowed = !!data.allowed;
    if (lastAllowed) {
      setStatus(`✅ Allowed${name ? " — " + name : ""}`, "ok");
      enableConfirm(true);
    } else {
      setStatus(`⛔ Denied — ${data.reason || "Not found / already checked-in"}`, "bad");
      enableConfirm(false);
    }
  } catch (e) {
    console.error(e);
    setStatus("Validation failed — check your Apps Script URL.", "bad");
    enableConfirm(false);
  }
}

function onFail() {
  // ignore frame decode failures
}

/* ========================
   Confirm check-in
======================== */
let confirming = false;

async function confirmCheckIn() {
  if (confirming) return;
  if (!lastCode) { setStatus("Scan a QR first.", "bad"); return; }
  if (!lastAllowed) { setStatus("This code is not allowed.", "bad"); return; }

  confirming = true;
  enableConfirm(false);

  try {
    const res = await fetch(`${ENDPOINT}?checkin=true&code=${encodeURIComponent(lastCode)}`, {
      credentials: "omit", cache: "no-store",
    });
    const data = await res.json();

    if (data.success) {
      // Feedback
      beep(120, 660, "square");
      buzz(70);

      // Optionally refresh name/guests if API echoes them
      const name = extractName(data) || $("#attendee").textContent;
      const rawGuests = extractGuestsRaw(data);
      if (!isNaN(rawGuests) && rawGuests !== 0) {
        const { companions, total } = normalizeGuests(rawGuests);
        setCompanions(companions);
        setBadgeTotal(total);
      }

      setStatus(`Checked-in${name ? " — " + name : ""} ✅`, "ok");
      lastCode = null;
      lastAllowed = false;
    } else {
      setStatus(`Check-in failed: ${data.reason || "Unknown error"}`, "bad");
    }
  } catch (e) {
    console.error(e);
    setStatus("Check-in request error.", "bad");
  } finally {
    confirming = false;
  }
}

/* ========================
   Wire up UI
======================== */
$("#scanBtn").addEventListener("click", async () => {
  if (isRunning) { await stopScanner(); setStatus("Stopped"); }
  else { await startScanner(); }
});

$("#confirmBtn").addEventListener("click", confirmCheckIn);

// Stop camera when the page hides (safety)
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { stopScanner(); }
});