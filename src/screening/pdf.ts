import { MAX_RESUME_TEXT } from "./schema";
export const MAX_PDF_SIZE = 5 * 1024 * 1024;
export async function extractPdf(file: File) {
  if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== "application/pdf")) throw new Error("请选择 PDF 简历");
  if (!file.size || file.size > MAX_PDF_SIZE) throw new Error("PDF 大小须在 5 MB 以内");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("文件不是有效的 PDF");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true, cMapUrl: "/pdf-cmaps/", cMapPacked: true });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 20) throw new Error("请上传不超过 20 页的简历");
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i), content = await page.getTextContent();
      pages.push(content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join(""));
      page.cleanup();
      if (pages.join("\n").length > MAX_RESUME_TEXT) throw new Error("简历文本超过 16000 字，请精简文件后重新上传");
    }
    const text = pages.join("\n").trim();
    if (text.replace(/\s/g, "").length < 40) throw new Error("该 PDF 无足够可选择文本，可能是扫描件；请上传带文字层的 PDF，当前未启用 OCR。");
    return text;
  } catch (error) {
    if (error instanceof Error && /password/i.test(error.name)) throw new Error("请先移除 PDF 密码再导入");
    throw error;
  } finally { await task.destroy(); }
}
