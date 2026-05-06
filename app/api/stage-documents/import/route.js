import { NextResponse } from "next/server";
import { extractUploadedDocument } from "../../../../lib/documentImport.js";

export const runtime = "nodejs";

export async function POST(request) {
  const formData = await request.formData();
  const files = formData.getAll("files").filter((item) => item instanceof File);

  if (!files.length) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  const documents = [];
  const errors = [];

  for (const file of files) {
    try {
      documents.push(await extractUploadedDocument(file));
    } catch (error) {
      errors.push(error.message || `${file.name} could not be imported`);
    }
  }

  if (!documents.length) {
    return NextResponse.json({ error: errors.join(" ") || "Files could not be imported" }, { status: 400 });
  }

  return NextResponse.json({ documents, errors });
}
