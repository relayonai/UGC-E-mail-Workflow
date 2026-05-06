import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import JSZip from "jszip";

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

  if (TEXT_EXTENSIONS.has(extension)) {
    content = cleanText(buffer.toString("utf8"));
  } else if (extension === ".docx") {
    content = await extractDocx(buffer);
  } else if (extension === ".pdf") {
    content = await extractPdf(buffer);
  } else if (extension === ".xlsx") {
    content = await extractXlsx(buffer);
  } else if (extension === ".pptx") {
    content = await extractPptx(buffer);
  } else if (IMAGE_EXTENSIONS.has(extension)) {
    content = `[Image reference: ${fileName}]\nUse this uploaded image as a shared visual reference for the workflow.`;
  } else {
    throw new Error(`${fileName} is not supported. Upload .pdf, .docx, .png, .pnj, .xlsx, or .pptx files.`);
  }

  if (!content) {
    throw new Error(`${fileName} did not contain extractable text.`);
  }

  return {
    title: fileName.replace(/\.[^.]+$/, ""),
    content
  };
}
