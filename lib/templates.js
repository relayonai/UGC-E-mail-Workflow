import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { listStageDocumentOverrides, listTemplateOverrides } from "./db.js";
import { WORKFLOW_STAGES } from "./workflow.js";

const DEFAULT_DOCX = process.env.UGC_DOCX_PATH || "/Users/keremyilmaz/Downloads/UGC Messages (1).docx";
const FALLBACK_TEXT = new URL("../data/ugc-messages.txt", import.meta.url);

const SECTION_ALIASES = [
  { stage: "First Touch Outreach", match: "first touch outreach" },
  { stage: "Meeting Setup", match: "meeting setup" },
  { stage: "After First Call", match: "after first call" },
  { stage: "Content Brief Offer", match: "content brief offer" },
  { stage: "No Offer", match: "no offer" },
  { stage: "Offer Acceptance Chase", match: "offer acceptance chase" },
  { stage: "Pre-Invoice Chase", match: "pre-invoice chase" },
  { stage: "Content Chase", match: "content chase" },
  { stage: "Post-Invoice Chase", match: "post invoice chase" },
  { stage: "Thank You + Final Check", match: "thank you + final check" },
  { stage: "Repurposing Request", match: "repurposing request" },
  { stage: "Retainer Offer", match: "retainer/follow-up offer" }
];

const EMPTY_STAGE_TEMPLATES = new Set(["Meeting Setup"]);

export function loadTemplateSource() {
  if (fs.existsSync(DEFAULT_DOCX)) {
    try {
      return execFileSync("textutil", ["-convert", "txt", "-stdout", DEFAULT_DOCX], {
        encoding: "utf8",
        maxBuffer: 1024 * 1024
      });
    } catch {
      // Fall through to the bundled copy so the app still runs.
    }
  }
  return fs.readFileSync(FALLBACK_TEXT, "utf8");
}

function tidyTemplate(value) {
  return value
    .replace(/\r/g, "")
    .replace(/\u200b/g, "")
    .replace(/\n[ \t]*\u2022[ \t]*/g, "\n- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanActionPoint(line) {
  const cleaned = line
    .trim()
    .replace(/^-\s*/, "")
    .trim();

  if (isStandaloneBracketLine(cleaned)) {
    return cleaned.slice(1, -1).trim();
  }

  return cleaned;
}

function isStandaloneBracketLine(line) {
  return /^\[[^\]]+\]$/.test(line.trim());
}

function isTemplatePlaceholderLine(line) {
  return ["[Name]", "[Your Name]"].includes(line.trim());
}

function splitTemplateAndActions(stage, rawValue) {
  const normalized = tidyTemplate(rawValue);
  const lines = normalized.split("\n");
  const templateLines = [];
  const actionPoints = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      templateLines.push(line);
      continue;
    }

    if (templateLines.length === 0 && /^\(.+\)$/.test(trimmed)) {
      actionPoints.push(cleanActionPoint(trimmed.replace(/^\(|\)$/g, "")));
      continue;
    }

    if (isStandaloneBracketLine(trimmed) && !isTemplatePlaceholderLine(trimmed)) {
      actionPoints.push(cleanActionPoint(trimmed));
      continue;
    }

    if (trimmed.startsWith("- ") && stage !== "First Touch Outreach") {
      actionPoints.push(cleanActionPoint(trimmed));
      continue;
    }

    templateLines.push(line);
  }

  return {
    template: tidyTemplate(templateLines.join("\n")),
    actionPoints: [...new Set(actionPoints.filter(Boolean))]
  };
}

export function parseStageContent(sourceText = loadTemplateSource()) {
  const lower = sourceText.toLowerCase();
  const positions = SECTION_ALIASES.map((item) => ({
    ...item,
    index: lower.indexOf(item.match)
  }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index);

  const templates = {};
  const actions = {};
  positions.forEach((item, idx) => {
    const start = item.index + item.match.length;
    const end = positions[idx + 1]?.index ?? sourceText.length;
    const content = splitTemplateAndActions(item.stage, sourceText.slice(start, end));
    templates[item.stage] = content.template;
    actions[item.stage] = content.actionPoints;
  });

  for (const stage of WORKFLOW_STAGES) {
    if (!templates[stage]) {
      templates[stage] = EMPTY_STAGE_TEMPLATES.has(stage) ? "" : "Template missing in UGC Messages.docx.";
    }
    if (!actions[stage]) actions[stage] = [];
  }

  return { templates, actions };
}

export function parseTemplates(sourceText = loadTemplateSource()) {
  return parseStageContent(sourceText).templates;
}

function documentId(stage, index) {
  return `${stage.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index + 1}`;
}

function actionPointToDocument(stage, point, index) {
  return {
    id: documentId(stage, index),
    title: `Document ${index + 1}`,
    content: String(point || "").trim()
  };
}

function normalizeStageDocuments(stage, value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === "string") return actionPointToDocument(stage, item, index);
      return {
        id: item.id || documentId(stage, index),
        title: String(item.title || `Document ${index + 1}`).trim(),
        content: String(item.content || "").trim()
      };
    })
    .filter((item) => item.content);
}

export function renderTemplate(template, creator, variables = {}) {
  const name = creator.name || "";
  const defaults = {
    Name: name,
    Deadline: creator.next_action_date || "",
    date: creator.next_action_date || "",
    "Your Name": process.env.UGC_SENDER_NAME || "Isa",
    "kerem google meet link": process.env.UGC_MEETING_LINK || "https://calendar.google.com/",
    "kerem meeting link": process.env.UGC_MEETING_LINK || "https://calendar.google.com/",
    "initial agreement": variables.initialAgreement || "the original campaign placement",
    "original placement": variables.initialAgreement || "the original campaign placement",
    "new placement": variables.newPlacement || "publish it on an additional channel",
    "10% of initial fee": variables.reuseFee || "10% of the initial fee",
    "10% of the initial fee": variables.reuseFee || "10% of the initial fee",
    "brief outline: number of videos / monthly structure / general scope": variables.retainerDetails || "monthly content deliverables and usage terms",
    "details about what this would look like": variables.retainerDetails || "monthly content deliverables and usage terms"
  };

  const allVariables = { ...defaults, ...variables };

  return template.replace(/^Hi X,/gm, `Hi ${name || "X"},`).replace(/\[([^\]]+)\]/g, (match, rawKey) => {
    const key = rawKey.trim();
    return Object.prototype.hasOwnProperty.call(allVariables, key) ? allVariables[key] : match;
  });
}

export function getDocumentTemplates() {
  return parseStageContent(loadTemplateSource()).templates;
}

export function getStageActions() {
  const actions = parseStageContent(loadTemplateSource()).actions;
  for (const override of listStageDocumentOverrides()) {
    try {
      actions[override.stage] = normalizeStageDocuments(override.stage, JSON.parse(override.action_points || "[]"))
        .map((document) => document.content);
    } catch {
      actions[override.stage] = [];
    }
  }
  return actions;
}

export function getStageDocuments() {
  const actions = parseStageContent(loadTemplateSource()).actions;
  const documents = Object.fromEntries(
    WORKFLOW_STAGES.map((stage) => [stage, normalizeStageDocuments(stage, actions[stage] || [])])
  );

  for (const override of listStageDocumentOverrides()) {
    try {
      documents[override.stage] = normalizeStageDocuments(override.stage, JSON.parse(override.action_points || "[]"));
    } catch {
      documents[override.stage] = [];
    }
  }

  return documents;
}

export function getTemplates() {
  const templates = getDocumentTemplates();
  for (const override of listTemplateOverrides()) {
    templates[override.stage] = override.template;
  }
  return templates;
}
