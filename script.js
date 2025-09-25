/* ========================
   Configuration
======================== */
const ENDPOINT = "https://script.google.com/macros/s/AKfycbxneS1XK9s7mIMeuHNjGZTfHLznYPqOlrSSGjReDIGgJwxXjT-94tIS-NxPZ3soijQt/exec";

// guests field config
const GUESTS_FIELD_IS_ADDITIONAL = false;

/* ========================
   State
======================== */
let qr = null;
let isRunning = false;
let lastCode = null;
let lastAllowed = false;
let audioCtx = null;

/* ========================
   Helpers
======================== */
const $ = (sel) => document.querySelector(sel);
const setStatus = (msg, cls = "") => {
  const el = $("#status");
  el.className = `status ${cls}`.trim();
  el.textContent = msg;
};
const setAttendee = (name) => { $("#attendee").textContent = name?.trim() || "—"; };
const setCompanions = (n) => { $("#companions").textContent = Number.isFinite(n) ? String(n) : "0"; };
const enableConfirm = (on) => { $("#confirmBtn").disabled = !on; };

function beep(d=120, f=880, t="sine") {
  try {
    audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = t; o.frequency.value = f;
    g.gain.value = 0.07;
    o.connect(g).connect(audioCtx.destination);
    o.start(); setTimeout(()=>o.stop(), d);
  } catch {}
}
function buzz(ms=50) { if(navigator.vibrate) try{navigator.vibrate(ms);}catch{} }

function extractName(data) {
  for (const k of ['name','full_name','fullname']) {
    if (data?.[k]) return String(data[k]).trim();
  }
  return "";
}
function extractGuestsRaw(data) {
  for (const k of ['guests','guest_count','companions','total_guests']) {
    if (data?.[k]) { const n = Number(data[k]); if(!isNaN(n)) return n; }
  }
  return 0;
}
function normalizeGuests(raw) {
  return GUESTS_FIELD_IS_ADDITIONAL
    ? { companions: raw, total: raw+1 }
    : { companions: Math.max(raw-1,0), total: raw };
}

/* ========================
   Scanner start/stop
======================== */
async function startScanner() {
  if (isRunning) return;
  enableConfirm(false);
  setStatus("Starting camera…");
  const cfg = { fps:10, qrbox:{width:420,height:420}, aspectRatio:1.0 };
  if (!qr) qr = new Html5Qrcode("reader");
  try {
    await qr.start({ facingMode:{ exact:"environment"} }, cfg, onScan, onFail);
    isRunning = true; $("#scanBtn").textContent="Stop"; setStatus("Scanning…");
  } catch {
    const devices = await Html5Qrcode.getCameras();
    const rear = devices.find(d=>/back|rear|environment/i.test(d.label))||devices[0];
    await qr.start({deviceId:{exact:rear.id}}, cfg, onScan, onFail);
    isRunning=true; $("#scanBtn").textContent="Stop"; setStatus("Scanning…");
  }
}
async function stopScanner() {
  if (!qr||!isRunning){ $("#scanBtn").textContent="Scan"; return; }
  try{await qr.stop();}catch{}
  isRunning=false; $("#scanBtn").textContent="Scan";
}

/* ========================
   Scan handlers
======================== */
async function onScan(decodedText) {
  lastCode = decodedText.trim();
  await stopScanner();
  beep(); buzz();
  setStatus(`Scanned: ${lastCode}`);
  try {
    const res = await fetch(`${ENDPOINT}?code=${encodeURIComponent(lastCode)}`,{cache:"no-store"});
    const data = await res.json();
    const name = extractName(data);
    const { companions } = normalizeGuests(extractGuestsRaw(data));
    setAttendee(name); setCompanions(companions);
    lastAllowed=!!data.allowed;
    if(lastAllowed){ setStatus(`✅ Allowed${name?" — "+name:""}`,"ok"); enableConfirm(true); }
    else{ setStatus(`⛔ Denied — ${data.reason||"Not found"}`,"bad"); enableConfirm(false); }
  } catch {
    setStatus("Validation failed — check your Apps Script URL.","bad");
    enableConfirm(false);
  }
}
function onFail(){}

/* ========================
   Confirm check-in
======================== */
let confirming=false;
async function confirmCheckIn(){
  if(confirming)return;
  if(!lastCode){setStatus("Scan a QR first.","bad");return;}
  if(!lastAllowed){setStatus("This code is not allowed.","bad");return;}
  confirming=true; enableConfirm(false);
  try{
    const res=await fetch(`${ENDPOINT}?checkin=true&code=${encodeURIComponent(lastCode)}`);
    const data=await res.json();
    if(data.success){ beep(120,660,"square"); buzz(70);
      setStatus(`Checked-in${extractName(data)?" — "+extractName(data):""} ✅`,"ok");
      lastCode=null; lastAllowed=false;
    } else { setStatus(`${data.reason||"Unknown"}`,"bad"); }
  }catch{ setStatus("Check-in request error.","bad"); }
  finally{ confirming=false; }
}

/* ========================
   Wire up UI
======================== */
$("#scanBtn").addEventListener("click",async()=>{
  if(isRunning){ await stopScanner(); setStatus("Stopped"); }
  else{ await startScanner(); }
});
$("#confirmBtn").addEventListener("click",confirmCheckIn);
document.addEventListener("visibilitychange",()=>{ if(document.hidden){stopScanner();}});