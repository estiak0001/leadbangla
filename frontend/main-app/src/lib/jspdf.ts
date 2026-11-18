/* eslint-disable @typescript-eslint/no-explicit-any */
// jsPDF is loaded from a CDN the first time someone views/downloads an invoice --
// no API key, nothing to install, mirrors the lazy-load pattern in lib/leaflet.ts.
let loading: Promise<any> | null = null;

export function loadJsPDF(): Promise<any> {
  const w = window as any;
  if (w.jspdf?.jsPDF) return Promise.resolve(w.jspdf.jsPDF);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const js = document.createElement("script");
    js.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
    js.onload = () => resolve(w.jspdf.jsPDF);
    js.onerror = () => { loading = null; reject(new Error("Could not load the PDF generator. Check your internet connection.")); };
    document.body.appendChild(js);
  });
  return loading;
}
