import fs from "node:fs";
import path from "node:path";
import {
  createCreator,
  findCreatorByEmail,
  getCreator,
  getSyncMeta,
  listCreatorsById,
  setSyncMeta,
  updateCreator
} from "./db.js";
import { WORKFLOW_STAGES } from "./workflow.js";

const DEFAULT_CSV_PATH = "/Users/keremyilmaz/Downloads/UGC tracking - Creator Contact List.csv";
const META_KEY = "creator_csv_mtime_ms";
const TITLE_ROW = ["Creator Contact List"];

const FIELD_COLUMNS = [
  { key: "id", header: "Tool ID", aliases: ["tool id", "creator id", "ugc id"] },
  { key: "name", header: "Name", aliases: ["name", "creator", "creator name", "full name"] },
  { key: "email", header: "Contact", aliases: ["contact", "email", "email address", "creator email"] },
  { key: "handle", header: "Handle\n[if applicable]", aliases: ["handle", "handle if applicable", "username"] },
  { key: "platform", header: "Platform", aliases: ["platform", "channel"] },
  { key: "niche", header: "Niche", aliases: ["niche", "category", "content niche"] },
  { key: "workflow_stage", header: "Workflow Stage", aliases: ["workflow stage", "stage", "status"] },
  { key: "next_action", header: "Next Action", aliases: ["next action", "action"] },
  { key: "next_action_date", header: "Next Action Date", aliases: ["next action date", "due date", "action date"] },
  { key: "offer_status", header: "Offer Status", aliases: ["offer status", "offer"] },
  { key: "invoice_status", header: "Invoice Status", aliases: ["invoice status", "invoice"] },
  { key: "content_status", header: "Content Status", aliases: ["content status", "content"] },
  { key: "approval_status", header: "Approval Status", aliases: ["approval status", "approval"] },
  { key: "last_email_sent", header: "Last Email Sent", aliases: ["last email sent"] },
  { key: "last_reply", header: "Last Reply", aliases: ["last reply"] },
  { key: "updated_at", header: "Tool Updated At", aliases: ["tool updated at", "updated at"] }
];

const IMPORT_FIELDS = new Set([
  "name",
  "email",
  "handle",
  "platform",
  "niche",
  "workflow_stage",
  "next_action",
  "next_action_date",
  "offer_status",
  "invoice_status",
  "content_status",
  "approval_status"
]);

let syncLock = Promise.resolve();

export function getSpreadsheetConfig() {
  const filePath = process.env.UGC_CREATORS_CSV_PATH ||
    process.env.UGC_CREATORS_SPREADSHEET_PATH ||
    DEFAULT_CSV_PATH;
  return { enabled: Boolean(filePath), filePath };
}

function parseCsv(text = "") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function serializeCsv(rows) {
  return rows
    .map((row) => row.map((value) => {
      const text = value === null || value === undefined ? "" : String(value);
      if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
      return text;
    }).join(","))
    .join("\n") + "\n";
}

function normalizeHeader(value = "") {
  return String(value)
    .trim()
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

function normalizeDate(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 10);
}

function normalizeStage(value = "") {
  const text = String(value || "").trim();
  return WORKFLOW_STAGES.includes(text) ? text : "";
}

function findHeaderRow(rows) {
  const index = rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    return headers.includes("name") && (headers.includes("contact") || headers.includes("email"));
  });
  return index >= 0 ? index : 0;
}

function ensureBaseRows(rows) {
  if (rows.length) return rows;
  return [TITLE_ROW, [], ["Name", "Contact", "Handle\n[if applicable]", "Format", "Outreach message sent?", "Meeting set up?\n[if applicable]", "Meeting notes", "Outcome", "notes"]];
}

function ensureColumns(rows, headerRowIndex) {
  const header = rows[headerRowIndex];
  const headerLookup = new Map();
  header.forEach((value, index) => {
    const normalized = normalizeHeader(value);
    if (normalized) headerLookup.set(normalized, index);
  });

  const columns = {};
  for (const field of FIELD_COLUMNS) {
    const existing = [field.header, ...field.aliases]
      .map(normalizeHeader)
      .map((alias) => headerLookup.get(alias))
      .find((index) => index !== undefined);

    if (existing !== undefined) {
      columns[field.key] = existing;
      continue;
    }

    columns[field.key] = header.length;
    header.push(field.header);
  }

  return columns;
}

function readRow(row, columns) {
  const data = {};
  for (const field of FIELD_COLUMNS) {
    const value = String(row[columns[field.key]] || "").trim();
    if (value) data[field.key] = value;
  }
  return data;
}

function inferStage(row) {
  const explicit = normalizeStage(row.workflow_stage);
  if (explicit) return explicit;
  const outreachSent = /^(true|yes|y|sent|1)$/i.test(row.outreachSent || "");
  const meetingSet = /^(true|yes|y|booked|1)$/i.test(row.meetingSet || "");
  if (meetingSet) return "After First Call";
  if (outreachSent) return "Meeting Setup";
  return "First Touch Outreach";
}

function readLegacyFields(rawRow, header) {
  const values = {};
  header.forEach((name, index) => {
    const normalized = normalizeHeader(name);
    if (normalized === "outreach message sent?") values.outreachSent = rawRow[index] || "";
    if (normalized === "meeting set up?") values.meetingSet = rawRow[index] || "";
    if (normalized === "format") values.format = rawRow[index] || "";
    if (normalized === "outcome") values.outcome = rawRow[index] || "";
    if (normalized === "notes") values.notes = rawRow[index] || "";
  });
  return values;
}

function creatorInputFromRow(row, legacy) {
  const input = {};
  for (const field of IMPORT_FIELDS) {
    if (!row[field]) continue;
    if (field === "workflow_stage") {
      const stage = normalizeStage(row[field]);
      if (stage) input.workflow_stage = stage;
      continue;
    }
    if (field.endsWith("_date")) {
      input[field] = normalizeDate(row[field]);
      continue;
    }
    input[field] = String(row[field]).trim();
  }

  if (!input.workflow_stage) input.workflow_stage = inferStage({ ...row, ...legacy });
  if (!input.niche && legacy.format) input.niche = String(legacy.format).trim();
  return input;
}

function creatorValues(creator) {
  return {
    id: creator.id,
    name: creator.name,
    email: creator.email,
    handle: creator.handle,
    platform: creator.platform,
    niche: creator.niche,
    workflow_stage: creator.workflow_stage,
    next_action: creator.next_action,
    next_action_date: normalizeDate(creator.next_action_date),
    offer_status: creator.offer_status,
    invoice_status: creator.invoice_status,
    content_status: creator.content_status,
    approval_status: creator.approval_status,
    last_email_sent: normalizeDate(creator.last_email_sent),
    last_reply: normalizeDate(creator.last_reply),
    updated_at: creator.updated_at
  };
}

function findRowForCreator(rows, headerRowIndex, columns, creator) {
  const email = normalizeEmail(creator.email);
  for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
    const row = readRow(rows[index], columns);
    if (Number(row.id) === Number(creator.id)) return index;
    if (email && normalizeEmail(row.email) === email) return index;
  }
  return -1;
}

function writeCreatorToRow(row, columns, creator) {
  const values = creatorValues(creator);
  const minLength = Math.max(row.length, ...Object.values(columns)) + 1;
  while (row.length < minLength) row.push("");

  for (const field of FIELD_COLUMNS) {
    row[columns[field.key]] = values[field.key] || "";
  }
}

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return ensureBaseRows([]);
  return ensureBaseRows(parseCsv(fs.readFileSync(filePath, "utf8")));
}

function writeCsv(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, serializeCsv(rows), "utf8");
}

async function importCsvRows(rows, headerRowIndex, columns) {
  const header = rows[headerRowIndex];
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
    const rawRow = rows[index];
    const row = readRow(rawRow, columns);
    const email = normalizeEmail(row.email);
    if (!email) {
      skipped += 1;
      continue;
    }

    const legacy = readLegacyFields(rawRow, header);
    const input = creatorInputFromRow(row, legacy);
    input.email = email;
    if (!input.name) input.name = row.name || row.handle || email;

    const existing = Number(row.id) ? getCreator(row.id) : findCreatorByEmail(email);
    if (existing) {
      updateCreator(existing.id, input);
      updated += 1;
    } else {
      createCreator(input);
      imported += 1;
    }
  }

  return { imported, updated, skipped };
}

function exportCreatorsToRows(rows, headerRowIndex, columns) {
  const creators = listCreatorsById();
  const activeIds = new Set(creators.map((creator) => Number(creator.id)));
  let appended = 0;
  let written = 0;

  for (let index = rows.length - 1; index > headerRowIndex; index -= 1) {
    const row = readRow(rows[index], columns);
    if (row.id && !activeIds.has(Number(row.id))) rows.splice(index, 1);
  }

  for (const creator of creators) {
    let rowIndex = findRowForCreator(rows, headerRowIndex, columns, creator);
    if (rowIndex < 0) {
      rowIndex = rows.length;
      rows.push([]);
      appended += 1;
    }
    writeCreatorToRow(rows[rowIndex], columns, creator);
    written += 1;
  }

  return { written, appended };
}

async function runSync({ forceImport = false, forceExport = false } = {}) {
  const config = getSpreadsheetConfig();
  if (!config.enabled) {
    return { enabled: false, message: "CSV sync is disabled." };
  }

  const exists = fs.existsSync(config.filePath);
  const lastSeen = Number(getSyncMeta(META_KEY) || 0);
  const mtimeMs = exists ? fs.statSync(config.filePath).mtimeMs : 0;
  const changedOnDisk = exists && mtimeMs > lastSeen + 1;
  const shouldImport = forceImport || changedOnDisk;

  const rows = readCsv(config.filePath);
  const headerRowIndex = findHeaderRow(rows);
  const columns = ensureColumns(rows, headerRowIndex);
  const importResult = shouldImport
    ? await importCsvRows(rows, headerRowIndex, columns)
    : { imported: 0, updated: 0, skipped: 0 };

  const shouldExport = forceExport || shouldImport || !exists;
  const exportResult = shouldExport
    ? exportCreatorsToRows(rows, headerRowIndex, columns)
    : { written: 0, appended: 0 };

  if (shouldExport) writeCsv(config.filePath, rows);
  const nextMtime = fs.existsSync(config.filePath) ? fs.statSync(config.filePath).mtimeMs : 0;
  setSyncMeta(META_KEY, String(nextMtime));

  return {
    enabled: true,
    path: config.filePath,
    imported: importResult.imported,
    updated: importResult.updated,
    skipped: importResult.skipped,
    written: exportResult.written,
    appended: exportResult.appended,
    changed: shouldImport || shouldExport
  };
}

function enqueueSync(options) {
  syncLock = syncLock.then(() => runSync(options), () => runSync(options));
  return syncLock;
}

export function syncCreatorsWithSpreadsheet(options = {}) {
  return enqueueSync(options);
}

export function exportCreatorsToSpreadsheet() {
  return enqueueSync({ forceExport: true });
}
