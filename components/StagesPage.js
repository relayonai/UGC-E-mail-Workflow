"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function documentLabel(document) {
  const name = document.fileName || document.title || "Document";
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  if (document.kind === "image") return "Image";
  if (ext === "pdf") return "PDF";
  if (ext === "docx") return "Word";
  if (ext === "xlsx") return "Excel";
  if (ext === "pptx") return "Slides";
  return "File";
}

function documentSummary(document) {
  if (document.kind === "image") return document.fileName || document.title || "Uploaded image";
  if (document.previewHtml) return "Formatted preview available";
  return document.mimeType || "Document";
}

function wrapPreviewHtml(html) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root { color-scheme: light; }
    body { margin: 0; padding: 20px; font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #1e293b; background: #fff; }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; max-width: 100%; }
    td, th { border: 1px solid #d1d5db; padding: 6px 8px; vertical-align: top; }
    p { margin: 0 0 10px; }
  </style></head><body>${html}</body></html>`;
}

export default function StagesPage() {
  const [stages, setStages] = useState([]);
  const [selectedStage, setSelectedStage] = useState("");
  const [draft, setDraft] = useState("");
  const [documents, setDocuments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [templateDragActive, setTemplateDragActive] = useState(false);
  const [previewDocumentId, setPreviewDocumentId] = useState("");
  const [notice, setNotice] = useState("");
  const templateRef = useRef(null);
  const acceptedFiles = ".pdf,.docx,.png,.pnj,.xlsx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/png";

  async function loadStages() {
    const response = await fetch("/api/stages");
    const data = await response.json();
    setStages(data.stages || []);
    const firstStage = selectedStage || data.stages?.[0]?.stage || "";
    const first = data.stages?.find((stage) => stage.stage === firstStage);
    setSelectedStage(firstStage);
    setDraft(first?.template || "");
    setDocuments(first?.documents || []);
  }

  useEffect(() => {
    loadStages();
  }, []);

  const selected = useMemo(
    () => stages.find((stage) => stage.stage === selectedStage) || null,
    [stages, selectedStage]
  );

  const previewDocument = useMemo(
    () => documents.find((document) => document.id === previewDocumentId) || null,
    [documents, previewDocumentId]
  );

  function selectStage(stage) {
    setSelectedStage(stage.stage);
    setDraft(stage.template || "");
    setDocuments(stage.documents || []);
    setNotice("");
  }

  const savedDocuments = useMemo(
    () => documents
      .map((document, index) => ({
        id: document.id || `document-${index + 1}`,
        title: document.title || `Document ${index + 1}`,
        content: document.content || "",
        kind: document.kind === "image" ? "image" : "text",
        mimeType: document.mimeType || "",
        fileName: document.fileName || "",
        dataUrl: document.dataUrl || "",
        previewHtml: document.previewHtml || ""
      }))
      .filter((document) => document.content.trim() || document.dataUrl || document.previewHtml),
    [documents]
  );

  function newDocumentId() {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `document-${Date.now()}`;
  }

  function addDocument() {
    setDocuments((items) => [
      ...items,
      { id: newDocumentId(), title: `Document ${items.length + 1}`, content: "" }
    ]);
  }

  function updateDocument(id, partial) {
    setDocuments((items) => items.map((item) => (item.id === id ? { ...item, ...partial } : item)));
  }

  function deleteDocument(id) {
    setDocuments((items) => items.filter((item) => item.id !== id));
  }

  async function importFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    setBusy(true);
    setNotice("");
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/stage-documents/import", {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      if (!response.ok) {
        setNotice(data.error || "Files could not be imported.");
        return;
      }

      const imported = (data.documents || []).map((document) => ({
        id: newDocumentId(),
        title: document.title,
        content: document.content,
        kind: document.kind || "text",
        mimeType: document.mimeType || "",
        fileName: document.fileName || "",
        dataUrl: document.dataUrl || "",
        previewHtml: document.previewHtml || ""
      }));
      setDocuments((items) => [...items, ...imported]);
      setNotice(data.errors?.length ? `Imported ${imported.length} file(s). ${data.errors.join(" ")}` : `Imported ${imported.length} file(s).`);
    } finally {
      setBusy(false);
    }
  }

  async function importDocument(event) {
    await importFiles(event.target.files);
    event.target.value = "";
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragActive(false);
    importFiles(event.dataTransfer.files);
  }

  function openDocument(document) {
    setPreviewDocumentId(document.id);
  }

  function closePreview() {
    setPreviewDocumentId("");
  }

  function insertDocumentIntoTemplate(document) {
    insertIntoTemplate(document.content || "");
    setNotice(`${document.title || "Document"} added to the template. Save to make it the default email.`);
  }

  function handleTemplateDrop(event) {
    event.preventDefault();
    setTemplateDragActive(false);
    const documentId = event.dataTransfer.getData("text/plain") || event.dataTransfer.getData("application/x-stage-document");
    const document = documents.find((item) => item.id === documentId);
    if (document) insertDocumentIntoTemplate(document);
  }

  function insertIntoTemplate(content) {
    const editor = templateRef.current;
    const insertion = content.trim();
    if (!insertion) return;

    if (!editor) {
      setDraft((current) => `${current.trimEnd()}\n\n${insertion}`.trim());
      return;
    }

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const before = draft.slice(0, start);
    const after = draft.slice(end);
    const needsBeforeSpace = before && !before.endsWith("\n") ? "\n" : "";
    const needsAfterSpace = after && !after.startsWith("\n") ? "\n" : "";
    const next = `${before}${needsBeforeSpace}${insertion}${needsAfterSpace}${after}`;
    setDraft(next);

    window.requestAnimationFrame(() => {
      editor.focus();
      const cursor = before.length + needsBeforeSpace.length + insertion.length;
      editor.setSelectionRange(cursor, cursor);
    });
  }

  function addAllDocumentsToTemplate() {
    const content = savedDocuments.map((document) => document.content.trim()).filter(Boolean).join("\n\n");
    if (!content) return;
    insertIntoTemplate(content);
    setNotice(`${savedDocuments.length} document(s) added to the template. Save to make it the default email.`);
  }

  async function saveTemplate() {
    if (!selected) return;
    setBusy(true);
    setNotice("");
    const response = await fetch("/api/stages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: selected.stage, template: draft, documents: savedDocuments })
    });
    const data = await response.json();
    if (response.ok) {
      setStages(data.stages || []);
      setNotice("Template and files saved.");
    } else {
      setNotice(data.error || "Template could not be saved.");
    }
    setBusy(false);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1>Stages</h1>
        <span>Workflow phases, stage logic, and editable email templates</span>
      </header>

      <div className="stage-page">
        <section className="section">
          <div className="section-header">
            <h2>Workflow Steps</h2>
          </div>
          <div className="workflow-step-list">
            {stages.map((stage, index) => (
              <button
                key={stage.stage}
                className={selectedStage === stage.stage ? "workflow-step selected" : "workflow-step"}
                onClick={() => selectStage(stage)}
              >
                <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="step-copy">
                  <strong>{stage.stage}</strong>
                  <span>{stage.phase}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-header">
            <h2>{selected?.stage || "Template"}</h2>
            <button className="primary" disabled={busy || !selected} onClick={saveTemplate}>Save Template</button>
          </div>
          <div className="panel-body">
            {notice && <div className="notice ok">{notice}</div>}
            {selected && (
              <div className="stage-meta">
                <div>
                  <span className="label">phase</span>
                  <strong>{selected.phase}</strong>
                </div>
                <div>
                  <span className="label">next action logic</span>
                  <strong>{selected.nextAction || "-"}</strong>
                </div>
              </div>
            )}
            <div
              className={dragActive ? "file-holder dragging" : "file-holder"}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (event.currentTarget === event.target) setDragActive(false);
              }}
              onDrop={handleDrop}
            >
              <div className="file-holder-head">
                <div>
                  <span className="label">shared file holder</span>
                  <strong>Same documents for every workflow step</strong>
                  <span>Drop files here or upload .pdf, .docx, .png, .pnj, .xlsx, or .pptx.</span>
                </div>
                <div>
                  <label className="secondary file-import">
                    Upload files
                    <input type="file" multiple accept={acceptedFiles} onChange={importDocument} />
                  </label>
                  <button type="button" disabled={!savedDocuments.length} onClick={addAllDocumentsToTemplate}>Add All to Template</button>
                  <button type="button" onClick={addDocument}>Add Document</button>
                </div>
              </div>
              <div className="stage-documents">
                {documents.length ? (
                  documents.map((document, index) => (
                    <article
                      key={document.id || index}
                      className="stage-document"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData("text/plain", document.id);
                        event.dataTransfer.setData("application/x-stage-document", document.id);
                      }}
                      onDragEnd={() => setTemplateDragActive(false)}
                      >
                      <div className="stage-document-head">
                        <button type="button" className="document-icon" onClick={() => openDocument(document)} aria-label={`Open ${document.title || "document"} preview`}>
                          <span className="document-icon-badge">{documentLabel(document)}</span>
                          <span className="document-icon-fold" aria-hidden="true" />
                          <span className="document-icon-title" title={document.title || `Document ${index + 1}`}>{document.title || `Document ${index + 1}`}</span>
                        </button>
                        <div className="stage-document-summary">{documentSummary(document)}</div>
                      </div>
                      <div className="stage-document-actions">
                        <button type="button" onClick={() => openDocument(document)}>Open</button>
                        <button type="button" onClick={() => insertDocumentIntoTemplate(document)}>Add to Template</button>
                        <button type="button" className="danger" onClick={() => deleteDocument(document.id)}>Delete</button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="empty">No shared documents yet. Drop files here to make them available for every workflow step.</div>
                )}
              </div>
            </div>
            <label>
              <span className="label">email template</span>
              <textarea
                ref={templateRef}
                className={templateDragActive ? "template-editor drop-target" : "template-editor"}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setTemplateDragActive(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  if (event.currentTarget === event.target) setTemplateDragActive(false);
                }}
                onDrop={handleTemplateDrop}
              />
            </label>
          </div>
        </section>
      </div>

      {previewDocument ? (
        <div className="document-modal-backdrop" onClick={closePreview}>
          <div className="document-modal" onClick={(event) => event.stopPropagation()}>
            <div className="document-modal-head">
              <div>
                <span className="label">document preview</span>
                <strong>{previewDocument.title || "Document"}</strong>
                <span>{documentLabel(previewDocument)} · {previewDocument.mimeType || previewDocument.fileName || "uploaded file"}</span>
              </div>
              <div className="document-modal-actions">
                {previewDocument.dataUrl ? (
                  <a className="secondary" href={previewDocument.dataUrl} download={previewDocument.fileName || `${previewDocument.title || "document"}`}>
                    Open original
                  </a>
                ) : null}
                <button type="button" className="primary" onClick={() => insertDocumentIntoTemplate(previewDocument)}>
                  Add to Template
                </button>
                <button type="button" onClick={closePreview}>Close</button>
              </div>
            </div>
            <div className="document-modal-body">
              {previewDocument.previewHtml ? (
                <iframe title={previewDocument.title || "Document preview"} className="document-preview-frame" srcDoc={wrapPreviewHtml(previewDocument.previewHtml)} />
              ) : previewDocument.dataUrl && previewDocument.mimeType?.startsWith("application/pdf") ? (
                <iframe title={previewDocument.title || "PDF preview"} className="document-preview-frame" src={previewDocument.dataUrl} />
              ) : previewDocument.dataUrl && previewDocument.kind === "image" ? (
                <img className="document-preview-image" src={previewDocument.dataUrl} alt={previewDocument.title || "Uploaded image"} />
              ) : previewDocument.dataUrl ? (
                <iframe title={previewDocument.title || "Document preview"} className="document-preview-frame" src={previewDocument.dataUrl} />
              ) : (
                <pre className="document-preview-text">{previewDocument.content || "No preview available."}</pre>
              )}
            </div>
            {previewDocument.content ? <pre className="document-modal-text">{previewDocument.content}</pre> : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
