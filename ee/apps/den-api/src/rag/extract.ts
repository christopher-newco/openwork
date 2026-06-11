import * as XLSX from "xlsx"
import mammoth from "mammoth"

const SUPPORTED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
])

async function getPdfParse() {
  const mod = await import("pdf-parse")
  // pdf-parse exports the function directly (ESM) or as .default (CJS)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mod as any).default ?? mod
}

export async function extractText(bytes: Buffer, mimeType: string): Promise<string> {
  if (!SUPPORTED_TYPES.has(mimeType)) {
    throw new Error(`unsupported_mime_type: ${mimeType}`)
  }

  if (mimeType === "application/pdf") {
    const pdfParse = await getPdfParse()
    const data = await pdfParse(bytes)
    return data.text
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel"
  ) {
    const workbook = XLSX.read(bytes, { type: "buffer" })
    const lines: string[] = []
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) continue
      lines.push(`--- Sheet: ${sheetName} ---`)
      lines.push(XLSX.utils.sheet_to_csv(sheet))
    }
    return lines.join("\n")
  }

  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ buffer: bytes })
    return result.value
  }

  // text/plain, text/markdown, text/csv
  return bytes.toString("utf-8")
}
