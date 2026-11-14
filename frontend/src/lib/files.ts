/**
 * Import (TXT, Markdown, DOCX) and export (TXT, Markdown, DOCX, PDF) — all inside the browser.
 * Heavy libraries are loaded only when a DOCX is actually imported/exported.
 */

export const IMPORT_ACCEPT = '.txt,.md,.markdown,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_IMPORT_BYTES = 15 * 1024 * 1024;

export async function importFile(file: File): Promise<string> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('That file is larger than 15 MB.');
  const name = file.name.toLowerCase();

  if (name.endsWith('.docx')) {
    const mammoth: any = await import('mammoth/mammoth.browser.js');
    const lib = mammoth.default || mammoth;
    const { value } = await lib.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return normalize(value);
  }
  if (name.endsWith('.doc') || name.endsWith('.pdf')) {
    throw new Error('Please convert the file to .docx or .txt first (old .doc and PDF files are not supported).');
  }
  return normalize(await file.text());
}

function normalize(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export type ExportFormat = 'txt' | 'md' | 'docx' | 'pdf';

function safeName(base: string): string {
  return (base || 'shivquill').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'shivquill';
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ExportOptions {
  /** Treat "*italic*" markers as italics (only citation/bibliography text uses them). Default false. */
  italics?: boolean;
}

/**
 * With `italics`, "*italic*" markers (used by citations) become real italics in DOCX/PDF, are removed
 * in TXT and stay as-is in Markdown. Without it, asterisks are ordinary text everywhere.
 */
export function parts(line: string, italics = false) {
  if (!italics) return line ? [{ text: line, italic: false }] : [];
  return line.split(/(\*[^*]+\*)/g).filter(Boolean).map(p =>
    p.length > 2 && p.startsWith('*') && p.endsWith('*') ? { text: p.slice(1, -1), italic: true } : { text: p, italic: false }
  );
}

export function plainText(text: string, italics = false): string {
  return italics ? text.replace(/\*([^*]+)\*/g, '$1') : text;
}

export async function exportText(text: string, format: ExportFormat, title = 'ShivQuill document', opts: ExportOptions = {}) {
  const base = safeName(title);
  const italics = !!opts.italics;
  if (format === 'txt') {
    download(new Blob([plainText(text, italics)], { type: 'text/plain;charset=utf-8' }), `${base}.txt`);
    return;
  }
  if (format === 'md') {
    download(new Blob([`# ${title}\n\n${text}\n`], { type: 'text/markdown;charset=utf-8' }), `${base}.md`);
    return;
  }
  if (format === 'docx') {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
    const paragraphs = [
      new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
      ...text.split('\n').map(line =>
        new Paragraph({ children: parts(line, italics).map(p => new TextRun({ text: p.text, italics: p.italic })) })
      )
    ];
    const doc = new Document({ sections: [{ children: paragraphs }] });
    download(await Packer.toBlob(doc), `${base}.docx`);
    return;
  }
  // PDF: use the browser's print-to-PDF, which supports every script/language (Hindi, Arabic, CJK…)
  printAsPdf(text, title, italics);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function printAsPdf(text: string, title: string, italics: boolean) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(iframe);
  const body = text
    .split(/\n{2,}/)
    .map(p => {
      const html = escapeHtml(p);
      return `<p>${(italics ? html.replace(/\*([^*]+)\*/g, '<em>$1</em>') : html).replace(/\n/g, '<br>')}</p>`;
    })
    .join('');
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:Georgia,'Times New Roman',serif;font-size:12pt;line-height:1.6;margin:2cm;color:#111}
h1{font-family:system-ui,sans-serif;font-size:18pt;margin:0 0 16pt}p{margin:0 0 10pt;white-space:normal}</style>
</head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`);
  doc.close();
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 60_000);
  }, 150);
}
