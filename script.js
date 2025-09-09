// Start scanner preferring the back camera, with fallback to any rear camera by deviceId
async function startScanner() {
  const cfg = { fps: 10, qrbox: { width: 400, height: 400 } };
  const elId = "reader";
  const qr = new Html5Qrcode(elId);

  try {
    // 1) Nudge iOS to show permission prompt in a user gesture (button click)
    const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
    tmp.getTracks().forEach(t => t.stop()); // immediately release

    // 2) First try: ask explicitly for the rear camera
    await qr.start({ facingMode: { exact: "environment" } }, cfg, onScan, () => {});
    return;
  } catch (e1) {
    // continue to fallback
  }

  try {
    // 3) Fallback: enumerate devices and pick one that looks like a back camera
    const devices = await Html5Qrcode.getCameras();
    const rear = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[0];
    if (!rear) throw new Error("No cameras found");

    await qr.start({ deviceId: { exact: rear.id } }, cfg, onScan, () => {});
  } catch (e2) {
    console.error(e2);
    alert("Camera unavailable. Check HTTPS and Safari camera permissions for this site.");
  }

  function onScan(text) {
    // your existing success handler
    console.log("Scanned:", text);
  }
}

function onScanSuccess(text) {
  // your existing logic...
  console.log("Scanned:", text);
}
function onScanFailure() { /* ignore frame failures for speed */ }

// call this from your Scan button
document.getElementById("scanBtn").addEventListener("click", startScanner);

let guestCount = 0;
let lastCode = null;

document.getElementById("scanBtn").addEventListener("click", async () => {
  const scanner = new Html5Qrcode("reader");
  const devices = await Html5Qrcode.getCameras();
  const camId = devices[0].id;

  scanner.start(
    { deviceId: { exact: camId }},
    { fps: 10, qrbox: 250 },
    (decodedText) => {
      lastCode = decodedText;
      console.log("Scanned:", decodedText);

      // Call your Google Apps Script endpoint to validate
      fetch("YOUR_GOOGLE_SCRIPT_URL?code=" + encodeURIComponent(decodedText))
        .then(res => res.json())
        .then(data => {
          if (data.allowed) {
            guestCount = data.guests || 1;
            document.getElementById("guestCount").innerText = guestCount;
          } else {
            alert("Invalid or already checked in");
          }
        });
    }
  );
});

document.getElementById("confirmBtn").addEventListener("click", () => {
  if (!lastCode) {
    alert("Scan a QR first!");
    return;
  }

  fetch("YOUR_GOOGLE_SCRIPT_URL?checkin=true&code=" + encodeURIComponent(lastCode))
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        alert("Guest confirmed!");
        document.getElementById("guestCount").innerText = "0";
      }
    });
});