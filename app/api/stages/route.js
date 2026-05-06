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
        .map((document, index) => ({
          id: String(document.id || `shared-document-${index + 1}`),
          title: String(document.title || `Document ${index + 1}`).trim(),
          content: String(document.content || "").trim()
        }))
        .filter((document) => document.content)
    );
  }
  return NextResponse.json({
    template: saved,
    stages: stageRows()
  });
}
