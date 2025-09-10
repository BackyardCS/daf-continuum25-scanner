/* ========================
   Configuration
======================== */
const ENDPOINT = "https://script.google.com/macros/s/AKfycbzXfi5rsmFvOn-BVcSd6FpY3xLPUf8rQ__om2Occba5WFzxq2pknsM38OtTi96sg_tD5Q/exec"; // e.g., https://script.google.com/macros/s/XXX/exec

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
const setGuests = (n) => { $("#guestCount").textContent = String(n ?? 0); };
const setAttendee = (name) => { $("#attendee").textContent = name ? `Guest: ${name}` : ""; };
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

  enableConfirm(false);        // confirm only after a valid scan
  setAttendee("");
  setGuests(0);
  setStatus("Starting camera…");

  const cfg = {
    fps: 10,
    qrbox: { width: 400, height: 400 }, // match CSS frame
    aspectRatio: 1.0                     // keep square preview behavior
  };

  if (!qr) qr = new Html5Qrcode("reader");

  try {
    // Permission nudge (especially for iOS Safari)
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
  // We do NOT clear status/attendee so the message persists
}

/* ========================
   Scan handlers
======================== */
async function onScan(decodedText) {
  // 1) Immediately capture and stop the camera (as requested)
  lastCode = (decodedText || "").trim();
  await stopScanner(); // close camera right away to “capture” the QR

  // Feedback: beep + light vibration
  beep(120, 880, "sine");
  buzz(50);

  setStatus(`Scanned: ${lastCode}`);
  // 2) Validate against your Google Sheets API
  try {
    const res = await fetch(`${ENDPOINT}?code=${encodeURIComponent(lastCode)}`, {
      credentials: "omit", cache: "no-store",
    });
    const data = await res.json(); // expected: { allowed: bool, name?: string, guests?: number, reason?: string }

    lastAllowed = !!data.allowed;
    if (lastAllowed) {
      setGuests(data.guests || 1);
      setAttendee(data.name || "");
      setStatus(`✅ Allowed${data.name ? " — " + data.name : ""}`, "ok");
      enableConfirm(true);   // allow confirm now
    } else {
      setGuests(0);
      setAttendee("");
      setStatus(`⛔ Denied — ${data.reason || "Not found / already checked-in"}`, "bad");
      enableConfirm(false);
    }
  } catch (e) {
    console.error(e);
    setStatus("Validation failed — check your Apps Script URL.", "bad");
    enableConfirm(false);
  }

  // NOTE: We intentionally do NOT auto-restart the camera.
  // The UI now shows the persistent status and captured details
  // until the user taps "Scan" again.
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
    const data = await res.json(); // expected: { success: bool, name?: string, reason?: string }

    if (data.success) {
      // Feedback on successful confirm
      beep(120, 660, "square");
      buzz(70);

      setStatus(`Checked-in${data.name ? " — " + data.name : ""} ✅`, "ok");
      // Keep the status and name on screen (persist) until next scan
      lastCode = null;
      lastAllowed = false;
      setGuests(0);
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