import { NextResponse } from "next/server";
import { getTemplates, renderTemplate } from "../../../lib/templates.js";
import { WORKFLOW, WORKFLOW_STAGES } from "../../../lib/workflow.js";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    templates: getTemplates(),
    workflow: WORKFLOW,
    stages: WORKFLOW_STAGES
  });
}

export async function POST(request) {
  const input = await request.json();
  const templates = getTemplates();
  const template = templates[input.stage] || "";
  return NextResponse.json({
    body: renderTemplate(template, input.creator || {}, input.variables || {})
  });
}
