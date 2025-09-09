/* ========================
   Configuration
======================== */
const ENDPOINT = "https://script.google.com/macros/s/AKfycbxQqaGiPd5JoTKlyyzwYnIkFL7P1bMwX184UPaXHHO9sMbn2Y5_Oh2VkaP7t4HsieIeDg/exec"; // e.g., https://script.google.com/macros/s/XXX/exec

/* ========================
   State
======================== */
let qr = null;
let isRunning = false;
let lastCode = null;

/* ========================
   Helpers
======================== */
const $ = (sel) => document.querySelector(sel);
const setStatus = (msg, cls = "") => {
  const el = $("#status");
  el.className = `status ${cls}`.trim();
  el.textContent = msg;
};
const setGuests = (n) => { $("#guestCount").textContent = String(n ?? 0); };

/* ========================
   Scanner start/stop
======================== */
async function startScanner() {
  if (isRunning) return;

  const cfg = {
    fps: 10,
    qrbox: { width: 400, height: 400 }, // match CSS frame
    aspectRatio: 1.0                     // keep square preview behavior
  };

  if (!qr) qr = new Html5Qrcode("reader");

  try {
    // Force permission prompt under user gesture (iOS quirk)
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
  if (!qr || !isRunning) return;
  try {
    await qr.stop();
  } catch { /* ignore */ }
  isRunning = false;
  $("#scanBtn").textContent = "Scan";
  setStatus("Stopped");
}

/* ========================
   Scan handlers
======================== */
async function onScan(decodedText) {
  // Example QR content: EVT-<response_id> or just <response_id>
  lastCode = decodedText;
  setStatus(`Scanned: ${decodedText}`);
  // Validate against your Google Sheets API
  try {
    const res = await fetch(`${ENDPOINT}?code=${encodeURIComponent(decodedText)}`, {
      credentials: "omit",
      cache: "no-store",
    });
    const data = await res.json(); // expected: { allowed: bool, name?: string, guests?: number, reason?: string }
    if (data.allowed) {
      setGuests(data.guests || 1);
      setStatus(`✅ Allowed${data.name ? " — " + data.name : ""}`, "ok");
    } else {
      setGuests(0);
      setStatus(`⛔ Denied — ${data.reason || "Not found / already checked-in"}`, "bad");
    }
  } catch (e) {
    console.error(e);
    setStatus("Validation failed — check your Apps Script URL.", "bad");
  }

  // Briefly pause to avoid double-reads
  try { await qr.pause(true); } catch {}
  setTimeout(() => { try { qr.resume(); } catch {} }, 900);
}

function onFail() {
  // Ignore frame decode failures to keep it responsive
}

/* ========================
   Confirm check-in
======================== */
async function confirmCheckIn() {
  if (!lastCode) {
    setStatus("Scan a QR first.", "bad");
    return;
  }
  try {
    const res = await fetch(`${ENDPOINT}?checkin=true&code=${encodeURIComponent(lastCode)}`, {
      credentials: "omit",
      cache: "no-store",
    });
    const data = await res.json(); // expected: { success: bool, name?: string }
    if (data.success) {
      setStatus(`Checked-in${data.name ? " — " + data.name : ""} ✅`, "ok");
      setGuests(0);
    } else {
      setStatus("Check-in failed. Try again.", "bad");
    }
  } catch (e) {
    console.error(e);
    setStatus("Check-in request error.", "bad");
  }
}

/* ========================
   Wire up UI
======================== */
$("#scanBtn").addEventListener("click", () => {
  if (isRunning) stopScanner(); else startScanner();
});

$("#confirmBtn").addEventListener("click", confirmCheckIn);

// Optional: stop camera when the page hides; resume on show
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { stopScanner(); }
});