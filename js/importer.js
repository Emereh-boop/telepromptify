// mammoth + pdf.js are bundled in /vendor and loaded only when a file is imported.
const MAX = 10 * 1024 * 1024;
const load = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });

export async function readFile(file) {
  if (file.size > MAX) throw new Error('File is over 10 MB');
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'txt') return file.text();
  const buf = await file.arrayBuffer();
  if (ext === 'docx') {
    await load('vendor/mammoth.browser.min.js');
    return (await window.mammoth.extractRawText({ arrayBuffer: buf })).value;
  }
  if (ext === 'pdf') {
    await load('vendor/pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    const pdf = await window.pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;
    let out = '';
    for (let p = 1; p <= Math.min(pdf.numPages, 200); p++) {
      const c = await (await pdf.getPage(p)).getTextContent();
      out += c.items.map(i => i.str).join(' ') + '\n';
    }
    return out;
  }
  throw new Error('Use .txt, .docx or .pdf');
}
