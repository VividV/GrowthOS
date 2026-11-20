"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Alert, Badge, Button, Card, CardContent, TBody, THead, TR, Table, toast } from "@platform/ui";
import type { PreviewRow } from "@/lib/csv";
import { commitImportAction, previewImportAction } from "@/server/customer-actions";

const TEMPLATE = "Name,Phone,Email,Location,Address,Notes\nAdaeze Okafor,0803 123 4567,adaeze@example.com,\"Lekki, Lagos\",,Prefers size M\n";

export function ImportFlow() {
  const router = useRouter();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<{ rows: PreviewRow[]; unknownColumns: string[]; tooMany: boolean; remaining: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onFile = async (file: File | undefined) => {
    setError(null);
    setPreview(null);
    if (!file) return;
    if (file.size > 2_000_000) { setError("File is too large (max 2 MB)."); return; }
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    start(async () => {
      const r = await previewImportAction(text);
      if (r.ok) setPreview(r.data); else setError(r.error);
    });
  };

  const counts = preview ? {
    ok: preview.rows.filter((r) => r.status === "ok").length,
    dup: preview.rows.filter((r) => r.status.startsWith("duplicate")).length,
    invalid: preview.rows.filter((r) => r.status === "invalid").length,
  } : null;
  const willImport = counts ? (preview?.remaining === null || preview?.remaining === undefined ? counts.ok : Math.min(counts.ok, preview.remaining)) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft"><FileSpreadsheet className="h-5 w-5 text-primary" /></span>
            <div>
              <p className="text-sm font-medium">{fileName || "Choose a CSV file"}</p>
              <p className="text-xs text-muted-foreground">Columns: Name (required), Phone, Email, Location, Address, Notes</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" asChild>
              <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="customers-template.csv"><Download /> Template</a>
            </Button>
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Upload className="h-4 w-4" /> {csv ? "Choose another" : "Upload CSV"}
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
        </CardContent>
      </Card>

      {error && <Alert tone="danger">{error}</Alert>}
      {pending && !preview && <p className="text-sm text-muted-foreground">Checking your file…</p>}

      {preview && counts && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4"><p className="text-xs text-muted-foreground">Ready to import</p><p className="text-2xl font-semibold text-success tabular">{counts.ok}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Duplicates skipped</p><p className="text-2xl font-semibold tabular">{counts.dup}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Rows with errors</p><p className="text-2xl font-semibold text-danger tabular">{counts.invalid}</p></Card>
          </div>
          {preview.unknownColumns.length > 0 && <Alert tone="info">These columns will be ignored: {preview.unknownColumns.join(", ")}</Alert>}
          {preview.tooMany && <Alert tone="warning">Only the first 2,000 rows are processed per import.</Alert>}
          {preview.remaining !== null && counts.ok > preview.remaining && (
            <Alert tone="warning" title="Plan limit">Your plan has room for {preview.remaining} more customers — only the first {preview.remaining} valid rows will be imported.</Alert>
          )}

          <Card className="overflow-hidden">
            <Table>
              <THead><tr><th>Line</th><th>Name</th><th>Phone</th><th>Email</th><th>Status</th></tr></THead>
              <TBody>
                {preview.rows.slice(0, 200).map((r) => (
                  <TR key={r.line}>
                    <td className="text-xs text-muted-foreground tabular">{r.line}</td>
                    <td className="text-sm">{r.data?.full_name ?? r.raw.full_name ?? "—"}</td>
                    <td className="text-sm">{r.data?.phone ?? r.raw.phone ?? ""}</td>
                    <td className="text-sm">{r.data?.email ?? r.raw.email ?? ""}</td>
                    <td>
                      {r.status === "ok" ? <Badge tone="success">Ready</Badge>
                        : r.status === "invalid" ? <span className="text-xs text-danger">{r.errors.join("; ")}</span>
                        : <Badge tone="neutral">{r.errors[0]}</Badge>}
                    </td>
                  </TR>
                ))}
              </TBody>
            </Table>
            {preview.rows.length > 200 && <p className="border-t px-4 py-2 text-xs text-muted-foreground">Showing first 200 of {preview.rows.length} rows.</p>}
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setCsv(null); setPreview(null); setFileName(""); }}>Cancel</Button>
            <Button disabled={willImport === 0} loading={pending} onClick={() => start(async () => {
              const r = await commitImportAction(csv!);
              if (!r.ok) { toast.error(r.error); return; }
              toast.success(`Imported ${r.data.imported} customers${r.data.skipped ? ` · ${r.data.skipped} skipped` : ""}`);
              router.push("/customers");
            })}>
              <CheckCircle2 /> Import {willImport} customer{willImport === 1 ? "" : "s"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
