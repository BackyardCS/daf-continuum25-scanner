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