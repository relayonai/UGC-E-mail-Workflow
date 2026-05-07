import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { listStageDocumentOverrides, listTemplateOverrides, SHARED_STAGE_DOCUMENTS_KEY } from "./db.js";
import { WORKFLOW_STAGES } from "./workflow.js";

const DEFAULT_DOCX = process.env.UGC_DOCX_PATH || "/Users/keremyilmaz/Downloads/UGC Messages (1).docx";
const FALLBACK_TEXT = new URL("../data/ugc-messages.txt", import.meta.url);
let templateSourceCache = null;
let parsedStageContentCache = null;

const SECTION_ALIASES = [
  {
    stage: "First Touch Outreach",
    matches: ["first touch outreach", "first outreach", "phase 1 stage 1: first outreach"]
  },
  {
    stage: "Meeting Setup",
    matches: ["meeting setup"]
  },
  {
    stage: "After First Call",
    matches: ["after first call", "after interview", "phase 1 stage 2: after interview"]
  },
  {
    stage: "Content Brief Offer",
    matches: ["content brief offer", "content offer", "phase 1 stage 3-a: content offer"]
  },
  {
    stage: "No Offer",
    matches: ["no offer", "phase 1 stage 3-b: no offer"]
  },
  {
    stage: "Offer Acceptance Chase",
    matches: ["offer acceptance chase", "phase 1 stage 4: offer acceptance chase"]
  },
  {
    stage: "Pre-Invoice Chase",
    matches: ["pre-invoice chase", "pre invoice chase", "phase 1 stage 5: pre-invoice chase"]
  },
  {
    stage: "Content Chase",
    matches: ["content chase", "phase 1 stage 6: content chase"]
  },
  {
    stage: "Post-Invoice Chase",
    matches: ["post invoice chase", "post-invoice chase", "phase 1 stage 7: post invoice chase"]
  },
  {
    stage: "Thank You + Final Check",
    matches: ["thank you + final check", "thank you final check", "phase 1 stage 8: thank you + final check"]
  },
  {
    stage: "Repurposing Request",
    matches: [
      "repurposing request",
      "phase 2 stage 1-a: repurposing request (reuse footage)",
      "phase 2 stage 1-b: repurposing request (new placement)"
    ]
  },
  {
    stage: "Retainer Offer",
    matches: ["retainer/follow-up offer", "retainer offer", "phase 3 stage 1: retainer/follow-up offer"]
  }
];

const EMPTY_STAGE_TEMPLATES = new Set(["Meeting Setup"]);

export function loadTemplateSource() {
  const sourcePath = fs.existsSync(DEFAULT_DOCX) ? DEFAULT_DOCX : FALLBACK_TEXT;
  const mtimeMs = fs.statSync(sourcePath).mtimeMs;
  const cacheKey = `${sourcePath}:${mtimeMs}`;

  if (templateSourceCache?.key === cacheKey) {
    return templateSourceCache.value;
  }

  let value;
  if (sourcePath === DEFAULT_DOCX) {
    try {
      value = execFileSync("textutil", ["-convert", "txt", "-stdout", DEFAULT_DOCX], {
        encoding: "utf8",
        maxBuffer: 1024 * 1024
      });
    } catch {
      // Fall through to the bundled copy so the app still runs.
      value = fs.readFileSync(FALLBACK_TEXT, "utf8");
    }
  } else {
    value = fs.readFileSync(FALLBACK_TEXT, "utf8");
  }

  templateSourceCache = { key: cacheKey, value };
  return value;
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

function normalizeHeading(value = "") {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[:：]\s*$/, "")
    .toLowerCase();
}

function aliasForHeading(line) {
  const heading = normalizeHeading(line);
  return SECTION_ALIASES.find((item) =>
    item.matches.some((match) => normalizeHeading(match) === heading)
  );
}

function findSectionPositions(sourceText) {
  const positions = [];
  const lines = /^([^\n]*)/gm;
  let match;

  while ((match = lines.exec(sourceText)) !== null) {
    const line = match[1];
    const alias = aliasForHeading(line);
    if (alias) {
      positions.push({
        ...alias,
        index: match.index,
        headingLength: line.length
      });
    }

    if (match[0] === "") lines.lastIndex += 1;
  }

  return positions.sort((a, b) => a.index - b.index);
}

export function parseStageContent(sourceText = loadTemplateSource()) {
  if (parsedStageContentCache?.sourceText === sourceText) {
    return parsedStageContentCache.value;
  }

  const positions = findSectionPositions(sourceText);
  const templates = {};
  const actions = {};
  positions.forEach((item, idx) => {
    const start = item.index + item.headingLength;
    const end = positions[idx + 1]?.index ?? sourceText.length;
    const content = splitTemplateAndActions(item.stage, sourceText.slice(start, end));
    templates[item.stage] = [templates[item.stage], content.template].filter(Boolean).join("\n\n");
    actions[item.stage] = [...new Set([...(actions[item.stage] || []), ...content.actionPoints])];
  });

  for (const stage of WORKFLOW_STAGES) {
    if (!templates[stage]) {
      templates[stage] = EMPTY_STAGE_TEMPLATES.has(stage) ? "" : "Template missing in UGC Messages.docx.";
    }
    if (!actions[stage]) actions[stage] = [];
  }

  const value = { templates, actions };
  parsedStageContentCache = { sourceText, value };
  return value;
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
        content: String(item.content || "").trim(),
        kind: item.kind === "image" ? "image" : "text",
        mimeType: typeof item.mimeType === "string" ? item.mimeType : "",
        fileName: typeof item.fileName === "string" ? item.fileName : "",
        dataUrl: typeof item.dataUrl === "string" ? item.dataUrl : "",
        previewHtml: typeof item.previewHtml === "string" ? item.previewHtml : ""
      };
    })
    .filter((item) => item.content || item.dataUrl || item.previewHtml);
}

function dedupeDocuments(documents) {
  const seen = new Set();
  return documents.filter((document) => {
    const key = `${document.title}\n${document.content}\n${document.dataUrl || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  let sharedDocuments = null;
  for (const override of listStageDocumentOverrides()) {
    try {
      if (override.stage === SHARED_STAGE_DOCUMENTS_KEY) {
        sharedDocuments = normalizeStageDocuments(override.stage, JSON.parse(override.action_points || "[]"));
      } else {
        actions[override.stage] = normalizeStageDocuments(override.stage, JSON.parse(override.action_points || "[]"))
          .map((document) => document.content);
      }
    } catch {
      actions[override.stage] = [];
    }
  }
  if (sharedDocuments) {
    for (const stage of WORKFLOW_STAGES) {
      actions[stage] = sharedDocuments.map((document) => document.content);
    }
  }
  return actions;
}

export function getStageDocuments() {
  let sharedDocuments = null;
  const legacyDocuments = [];
  const documents = Object.fromEntries(WORKFLOW_STAGES.map((stage) => [stage, []]));

  for (const override of listStageDocumentOverrides()) {
    try {
      if (override.stage === SHARED_STAGE_DOCUMENTS_KEY) {
        sharedDocuments = normalizeStageDocuments(override.stage, JSON.parse(override.action_points || "[]"));
      } else if (WORKFLOW_STAGES.includes(override.stage)) {
        legacyDocuments.push(...normalizeStageDocuments(override.stage, JSON.parse(override.action_points || "[]")));
      }
    } catch {
      if (override.stage === SHARED_STAGE_DOCUMENTS_KEY) sharedDocuments = [];
    }
  }

  if (!sharedDocuments) sharedDocuments = dedupeDocuments(legacyDocuments);

  for (const stage of WORKFLOW_STAGES) {
    documents[stage] = sharedDocuments;
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
