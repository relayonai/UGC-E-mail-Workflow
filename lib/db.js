import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { computeNextAction, WORKFLOW_STAGES } from "./workflow.js";

const ROOT = process.cwd();
const DB_PATH = process.env.UGC_DB_PATH || path.join(ROOT, "data", "ugc.sqlite");

let db;

function ensureDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS creators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      handle TEXT DEFAULT '',
      platform TEXT DEFAULT '',
      niche TEXT DEFAULT '',
      workflow_stage TEXT NOT NULL DEFAULT 'First Touch Outreach',
      last_email_sent TEXT,
      last_reply TEXT,
      next_action TEXT DEFAULT 'Send first outreach',
      next_action_date TEXT,
      offer_status TEXT DEFAULT 'pending',
      invoice_status TEXT DEFAULT 'not requested',
      content_status TEXT DEFAULT 'not started',
      approval_status TEXT DEFAULT 'pending',
      message_history TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stage_templates (
      stage TEXT PRIMARY KEY,
      template TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stage_actions (
      stage TEXT PRIMARY KEY,
      action_points TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec(`
    UPDATE creators
    SET workflow_stage = 'No Offer',
        next_action = 'Send no-offer closeout or keep creator for future reference',
        updated_at = CURRENT_TIMESTAMP
    WHERE workflow_stage = 'Paused';

    UPDATE creators
    SET workflow_stage = 'Retainer Offer',
        next_action = 'Offer monthly retainer to creators you want to keep working with',
        updated_at = CURRENT_TIMESTAMP
    WHERE workflow_stage = 'Completed';
  `);
  return db;
}

function normalize(row) {
  if (!row) return null;
  return {
    ...row,
    message_history: JSON.parse(row.message_history || "[]")
  };
}

function serialize(input) {
  return {
    ...input,
    message_history: JSON.stringify(input.message_history || [])
  };
}

export function listCreators() {
  return ensureDb()
    .prepare("SELECT * FROM creators ORDER BY COALESCE(next_action_date, '9999-12-31'), updated_at DESC")
    .all()
    .map(normalize);
}

export function getCreator(id) {
  return normalize(ensureDb().prepare("SELECT * FROM creators WHERE id = ?").get(Number(id)));
}

export function findCreatorByEmail(email) {
  return normalize(ensureDb().prepare("SELECT * FROM creators WHERE lower(email) = lower(?)").get(String(email || "")));
}

export function createCreator(input) {
  const workflowStage = WORKFLOW_STAGES.includes(input.workflow_stage) ? input.workflow_stage : "First Touch Outreach";
  const creator = {
    name: input.name,
    email: input.email,
    handle: input.handle || "",
    platform: input.platform || "",
    niche: input.niche || "",
    workflow_stage: workflowStage,
    last_email_sent: null,
    last_reply: null,
    next_action: "Send first outreach",
    next_action_date: null,
    offer_status: input.offer_status || "pending",
    invoice_status: input.invoice_status || "not requested",
    content_status: input.content_status || "not started",
    approval_status: input.approval_status || "pending",
    message_history: []
  };

  const next = computeNextAction(creator);
  const result = ensureDb()
    .prepare(`
      INSERT INTO creators (
        name, email, handle, platform, niche, workflow_stage, last_email_sent, last_reply,
        next_action, next_action_date, offer_status, invoice_status, content_status,
        approval_status, message_history
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      creator.name,
      creator.email,
      creator.handle,
      creator.platform,
      creator.niche,
      creator.workflow_stage,
      creator.last_email_sent,
      creator.last_reply,
      next.next_action,
      next.next_action_date,
      creator.offer_status,
      creator.invoice_status,
      creator.content_status,
      creator.approval_status,
      JSON.stringify(creator.message_history)
    );

  return getCreator(result.lastInsertRowid);
}

export function updateCreator(id, input) {
  const current = getCreator(id);
  if (!current) return null;

  const merged = {
    ...current,
    ...input,
    workflow_stage: WORKFLOW_STAGES.includes(input.workflow_stage) ? input.workflow_stage : current.workflow_stage
  };
  const next = computeNextAction(merged);
  if (!input.next_action) merged.next_action = next.next_action;
  if (!input.next_action_date) merged.next_action_date = next.next_action_date;

  const value = serialize(merged);
  ensureDb()
    .prepare(`
      UPDATE creators SET
        name = ?, email = ?, handle = ?, platform = ?, niche = ?, workflow_stage = ?,
        last_email_sent = ?, last_reply = ?, next_action = ?, next_action_date = ?,
        offer_status = ?, invoice_status = ?, content_status = ?, approval_status = ?,
        message_history = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .run(
      value.name,
      value.email,
      value.handle,
      value.platform,
      value.niche,
      value.workflow_stage,
      value.last_email_sent,
      value.last_reply,
      value.next_action,
      value.next_action_date,
      value.offer_status,
      value.invoice_status,
      value.content_status,
      value.approval_status,
      value.message_history,
      Number(id)
    );

  return getCreator(id);
}

export function deleteCreator(id) {
  const result = ensureDb().prepare("DELETE FROM creators WHERE id = ?").run(Number(id));
  return result.changes > 0;
}

export function appendMessage(id, message, updates = {}) {
  const creator = getCreator(id);
  if (!creator) return null;
  const history = [...creator.message_history, { id: crypto.randomUUID(), ...message }];
  return updateCreator(id, { ...updates, message_history: history });
}

export function hasProviderMessage(providerMessageId) {
  if (!providerMessageId) return false;
  return listCreators().some((creator) =>
    creator.message_history.some((message) => message.provider_message_id === providerMessageId)
  );
}

export function listTemplateOverrides() {
  return ensureDb().prepare("SELECT stage, template, updated_at FROM stage_templates").all();
}

export function getTemplateOverride(stage) {
  return ensureDb().prepare("SELECT stage, template, updated_at FROM stage_templates WHERE stage = ?").get(stage);
}

export function saveTemplateOverride(stage, template) {
  ensureDb()
    .prepare(`
      INSERT INTO stage_templates (stage, template, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(stage) DO UPDATE SET
        template = excluded.template,
        updated_at = CURRENT_TIMESTAMP
    `)
    .run(stage, template);

  return getTemplateOverride(stage);
}

export function listStageDocumentOverrides() {
  return ensureDb().prepare("SELECT stage, action_points, updated_at FROM stage_actions").all();
}

export function getStageDocumentOverride(stage) {
  return ensureDb().prepare("SELECT stage, action_points, updated_at FROM stage_actions WHERE stage = ?").get(stage);
}

export function saveStageDocumentOverride(stage, documents) {
  ensureDb()
    .prepare(`
      INSERT INTO stage_actions (stage, action_points, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(stage) DO UPDATE SET
        action_points = excluded.action_points,
        updated_at = CURRENT_TIMESTAMP
    `)
    .run(stage, JSON.stringify(documents || []));

  return getStageDocumentOverride(stage);
}

export const listActionOverrides = listStageDocumentOverrides;
export const getActionOverride = getStageDocumentOverride;
export const saveActionOverride = saveStageDocumentOverride;

export function clearTemplateOverrides() {
  ensureDb().exec("DELETE FROM stage_templates");
}

export function clearCreators() {
  ensureDb().exec("DELETE FROM creators");
}
