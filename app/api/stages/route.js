import { NextResponse } from "next/server";
import { saveStageDocumentOverride, saveTemplateOverride, SHARED_STAGE_DOCUMENTS_KEY } from "../../../lib/db.js";
import { getStageDocuments, getTemplates } from "../../../lib/templates.js";
import { STAGE_PHASES, WORKFLOW, WORKFLOW_PHASES, WORKFLOW_STAGES } from "../../../lib/workflow.js";

export const runtime = "nodejs";

function stageRows() {
  const templates = getTemplates();
  const documents = getStageDocuments();
  return WORKFLOW_STAGES.map((stage) => ({
    stage,
    phase: STAGE_PHASES[stage] || "Other",
    template: templates[stage] || "",
    documents: documents[stage] || [],
    nextAction: WORKFLOW[stage]?.nextAction || "",
    followUpDays: WORKFLOW[stage]?.followUpDays ?? null
  }));
}

function normalizeDocument(document, index) {
  const content = String(document.content || "").trim();
  const dataUrl = typeof document.dataUrl === "string" ? document.dataUrl : "";
  return {
    id: String(document.id || `shared-document-${index + 1}`),
    title: String(document.title || `Document ${index + 1}`).trim(),
    content,
    kind: document.kind === "image" ? "image" : "text",
    mimeType: typeof document.mimeType === "string" ? document.mimeType : "",
    fileName: typeof document.fileName === "string" ? document.fileName : "",
    dataUrl,
    previewHtml: typeof document.previewHtml === "string" ? document.previewHtml : ""
  };
}

export async function GET() {
  return NextResponse.json({
    phases: WORKFLOW_PHASES,
    stages: stageRows()
  });
}

export async function PATCH(request) {
  const input = await request.json();
  if (!WORKFLOW_STAGES.includes(input.stage)) {
    return NextResponse.json({ error: "Unknown stage" }, { status: 400 });
  }

  const saved = saveTemplateOverride(input.stage, input.template || "");
  if (Array.isArray(input.documents)) {
    saveStageDocumentOverride(
      SHARED_STAGE_DOCUMENTS_KEY,
      input.documents
        .map(normalizeDocument)
        .filter((document) => document.content || document.dataUrl || document.previewHtml)
    );
  }
  return NextResponse.json({
    template: saved,
    stages: stageRows()
  });
}
