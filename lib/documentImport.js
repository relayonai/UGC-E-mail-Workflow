import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".csv"]);

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
  } else {
    throw new Error(`${fileName} is not supported. Upload .txt, .md, .csv, .pdf, or .docx files.`);
  }

  if (!content) {
    throw new Error(`${fileName} did not contain extractable text.`);
  }

  return {
    title: fileName.replace(/\.[^.]+$/, ""),
    content
  };
}
