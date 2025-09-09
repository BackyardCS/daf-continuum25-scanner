// Start scanner preferring the back camera, with fallback to any rear camera by deviceId
async function startScanner() {
  const config = { fps: 10, qrbox: { width: 400, height: 400 } };

  const html5QrCode = new Html5Qrcode("reader");

  try {
    // 1) Ask for a rear camera by constraint (simplest)
    await html5QrCode.start(
      { facingMode: { exact: "environment" } },  // back camera
      config,
      onScanSuccess,
      onScanFailure
    );
    return; // success
  } catch (e) {
    // If the exact facingMode fails (or device ignores it), fall back to device enumeration
  }

  try {
    // 2) Enumerate cameras, pick one whose label looks like a back camera
    // NOTE: On iOS, labels are empty until permission has been granted at least once.
    const devices = await Html5Qrcode.getCameras();
    // pick a rear/back camera if available
    const rear = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[0];
    if (!rear) throw new Error("No cameras found");

    await html5QrCode.start(
      { deviceId: { exact: rear.id } },
      config,
      onScanSuccess,
      onScanFailure
    );
  } catch (err) {
    console.error("Could not start back camera:", err);
    alert("Camera start failed. Check permissions and HTTPS.");
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