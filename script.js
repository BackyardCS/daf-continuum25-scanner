/* ========================
   Configuration
======================== */
const ENDPOINT = "https://script.google.com/macros/s/AKfycbzRzfeyTu1eAB4W7HRd8nugD3_IUSO8Mm7hTbiTmJPugneOCyg9qm4ubeu11qAwR04L6g/exec"; // e.g., https://script.google.com/macros/s/XXX/exec

/* ========================
   State
======================== */
let qr = null;
let isRunning = false;
let lastCode = null;
let lastAllowed = false;

// Web Audio (beep) setup
let audioCtx = null;

/* ========================
   Helpers
======================== */
const $ = (sel) => document.querySelector(sel);
const setStatus = (msg, cls = "") => {
  const el = $("#status");
  el.className = `status ${cls}`.trim();
  el.textContent = msg;
  // STATUS PERSISTS until next action
};
const setGuestsBadge = (n) => { $("#guestCount").textContent = String(n ?? 0); };
const setAttendee = (name) => { $("#attendee").textContent = name && name.trim() ? name : "—"; };
const setCompanions = (n) => { $("#companions").textContent = Number.isFinite(n) ? String(n) : "0"; };
const enableConfirm = (on) => { $("#confirmBtn").disabled = !on; };

// Beep using Web Audio API (works without audio files)
function beep(duration = 120, freq = 880, type = "sine") {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0.07; // gentle volume
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); }, duration);
  } catch (_) { /* ignore */ }
}

// Light haptic feedback (where supported)
function buzz(ms = 50) {
  if (navigator.vibrate) try { navigator.vibrate(ms); } catch(_) {}
}

/* ========================
   Scanner start/stop
======================== */
async function startScanner() {
  if (isRunning) return;

  // Do NOT clear name/companions here; they persist until next scan result
  enableConfirm(false);
  setStatus("Starting camera…");

  const cfg = {
    fps: 10,
    qrbox: { width: 420, height: 420 }, // match CSS frame (max-width 420px)
    aspectRatio: 1.0
  };

  if (!qr) qr = new Html5Qrcode("reader");

  try {
    // Permission nudge (esp. iOS Safari)
    const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
    tmp.getTracks().forEach(t => t.stop());

    // Prefer back camera first
    await qr.start({ facingMode: { exact: "environment" } }, cfg, onScan, onFail);
    isRunning = true;
    $("#scanBtn").textContent = "Stop";
    setStatus("Scanning…");
    return;
  } catch (_) {
    // fall back to device enumeration
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
  // We do NOT clear status/name/companions so they persist
}

/* ========================
   Scan handlers
======================== */
async function onScan(decodedText) {
  // 1) Immediately capture and stop the camera
  lastCode = (decodedText || "").trim();
  await stopScanner(); // “capture” this QR

  // Feedback: beep + light vibration
  beep(120, 880, "sine");
  buzz(50);

  setStatus(`Scanned: ${lastCode}`);
  // 2) Validate against your Google Sheets API
  try {
    const res = await fetch(`${ENDPOINT}?code=${encodeURIComponent(lastCode)}`, {
      credentials: "omit", cache: "no-store",
    });
    const data = await res.json(); // { allowed, name?, guests?, reason? }

    // Always reflect name & companions in UI, regardless of status
    const name = data.name || "";
    const guests = Number.isFinite(data.guests) ? data.guests : (data.guests ? Number(data.guests) : 0);

    setAttendee(name);
    setCompanions(guests);
    setGuestsBadge(guests);

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

  // We intentionally do NOT auto-restart the camera.
}

function onFail() {
  // Ignore frame decode failures to keep it responsive
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
    const data = await res.json(); // { success, name?, reason? }

    if (data.success) {
      // Feedback on successful confirm
      beep(120, 660, "square");
      buzz(70);

      setStatus(`Checked-in${data.name ? " — " + data.name : ""} ✅`, "ok");
      // Keep name + companions + badge as-is until next scan
      lastCode = null;
      lastAllowed = false;
    } else {
      setStatus(`Check-in failed: ${data.reason || "Unknown error"}`, "bad");
      // allow retry (camera is closed; user can press Scan again)
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