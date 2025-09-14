# 📱 QR Scanner Web App

A lightweight **web-based check-in tool** for events.  
This app uses the device camera to scan QR codes from attendee tickets and updates their check-in status in **Google Sheets** via **Apps Script**.

---

## 🚀 Features

- **Camera Scanner**
  - Opens the device’s **back camera** by default (with fallback).
  - Scans QR codes directly in the browser (no uploads).
  - Stops the camera automatically once a QR is detected.

- **Attendee Info Display**
  - Shows **Name, Email, Guest Count, and Status** on screen.
  - Keeps the last scanned result visible until the next scan.

- **Check-In Confirmation**
  - Tap **Confirm** to update `checked_in = TRUE` and set `checked_in_at` in the Google Sheet.
  - Prevents duplicate scans by validating on the server.

- **User Feedback**
  - **Beep sound + vibration** on successful scan (if device supports it).
  - Clear status indicators (`Checked In` vs `Not Checked In`).

- **Responsive Design**
  - Works on phones, tablets, and desktops.
  - Logo scales dynamically to fit different screen sizes.

---

## ⚙️ Tech Stack

- **Frontend**  
  - HTML5 + CSS (responsive styling)  
  - JavaScript (`getUserMedia`, `BarcodeDetector`, fallbacks)  

- **Backend**  
  - **Google Apps Script** (deployed as a Web App)  
  - Reads and updates attendee data in **Google Sheets**

- **Data Source**  
  - Google Sheet with headers:  
    ```
    response_id | name | email | guests | checked_in | checked_in_at
    ```

---

## 🛠 Setup

1. **Google Sheet**
   - Create or use an existing sheet with the headers above.
   - Deploy an **Apps Script Web App** that exposes an endpoint for check-in updates.

2. **Apps Script**
   - Place the provided `Code.gs` file in your Apps Script project.
   - Deploy → **New Deployment** → **Web App** → set:
     - Execute as: **Me**
     - Who has access: **Anyone with link**

3. **Web App (Frontend)**
   - Clone this repo.
   - Update the `ENDPOINT` URL in `script.js` with your Apps Script Web App URL.
   - Serve via GitHub Pages, Vercel, Netlify, or any HTTPS host.

---

## 📊 Capabilities

- **Live Check-Ins** → Real-time updates to the Google Sheet when scanning tickets.  
- **Duplicate Handling** → The backend can flag already checked-in tickets.  
- **Cross-Platform Support** → Works in modern browsers (Chrome, Safari, Edge).  
- **Secure** → Requires **HTTPS** and only transmits QR values (ticket IDs).  

---

## 🔒 Limitations

- **Apps Script Quotas** apply (read/write per minute & per day).  
- **Camera API** requires HTTPS.  
- **Vibration & Beep** may not work on all browsers/devices.  
- **BarcodeDetector** is not supported everywhere (use ZXing polyfill if needed).  

---

## ✅ Future Enhancements

- Offline buffer: allow scanning without network, sync later.  
- Duplicate alert banner on re-scan.  
- Export check-in log.  
- Multi-event support via different Sheets.  

---

## 📸 Screenshots

*(Add here after you capture app screenshots in action)*

---

## 👩‍💻 Maintainers

Built for **DAF Continuum 2025** check-in operations.  
Maintained by the event tech team.