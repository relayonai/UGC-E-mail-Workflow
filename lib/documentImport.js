import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import JSZip from "jszip";
import path from "node:path";
import { pathToFileURL } from "node:url";

const pdfWorkerPath = path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
PDFParse.setWorker(pathToFileURL(pdfWorkerPath).href);

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".csv"]);
const IMAGE_EXTENSIONS = new Set([".png", ".pnj"]);

function decodeXml(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function extensionFor(fileName = "") {
  const match = fileName.toLowerCase().match(/\.[^.]+$/);
  return match ? match[0] : "";
}

function cleanText(value = "") {
  return value
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mimeTypeForExtension(extension) {
  if (extension === ".png" || extension === ".pnj") return "image/png";
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (extension === ".pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return "application/octet-stream";
}

function toDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function extractPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ pageJoiner: "\n\n" });
    return cleanText(result.text || "");
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return cleanText(result.value || "");
}

async function extractDocxHtml(buffer) {
  const result = await mammoth.convertToHtml({ buffer });
  return (result.value || "").trim();
}

async function extractZipXmlText(buffer, filePattern) {
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.values(zip.files)
    .filter((file) => !file.dir && filePattern.test(file.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const parts = [];

  for (const file of files) {
    const xml = await file.async("text");
    const text = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>|<t[^>]*>([\s\S]*?)<\/t>|<v[^>]*>([\s\S]*?)<\/v>/g)]
      .map((match) => decodeXml(match[1] || match[2] || match[3] || ""))
      .map((value) => value.trim())
      .filter(Boolean)
      .join("\n");
    if (text) parts.push(text);
  }

  return cleanText(parts.join("\n\n"));
}

async function extractXlsx(buffer) {
  return extractZipXmlText(buffer, /^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/);
}

async function extractPptx(buffer) {
  return extractZipXmlText(buffer, /^ppt\/slides\/slide\d+\.xml$/);
}

export async function extractUploadedDocument(file) {
  const fileName = file.name || "Document";
  const extension = extensionFor(fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  let content = "";
  let kind = "text";
  let dataUrl = "";
  let mimeType = file.type || mimeTypeForExtension(extension);
  let previewHtml = "";

  if (!TEXT_EXTENSIONS.has(extension)) {
    dataUrl = toDataUrl(buffer, mimeType);
  }

  if (TEXT_EXTENSIONS.has(extension)) {
    content = cleanText(buffer.toString("utf8"));
  } else if (extension === ".docx") {
    content = await extractDocx(buffer);
    previewHtml = await extractDocxHtml(buffer);
  } else if (extension === ".pdf") {
    content = await extractPdf(buffer);
  } else if (extension === ".xlsx") {
    content = await extractXlsx(buffer);
  } else if (extension === ".pptx") {
    content = await extractPptx(buffer);
  } else if (IMAGE_EXTENSIONS.has(extension)) {
    kind = "image";
    mimeType = file.type || mimeTypeForExtension(extension);
    dataUrl = toDataUrl(buffer, mimeType);
    content = `[Image reference: ${fileName}]\nUse this uploaded image as a shared visual reference for the workflow.`;
  } else {
    throw new Error(`${fileName} is not supported. Upload .pdf, .docx, .png, .pnj, .xlsx, or .pptx files.`);
  }

  if (!content) {
    throw new Error(`${fileName} did not contain extractable text.`);
  }

  return {
    title: fileName.replace(/\.[^.]+$/, ""),
    content,
    kind,
    mimeType,
    fileName,
    dataUrl,
    previewHtml
  };
}
