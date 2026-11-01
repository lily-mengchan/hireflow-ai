/* Shared synthetic test fixtures; no real candidate information. */
const text = "Demo Candidate Q\nEducation: Bachelor; Demo University.\nExperience: 4 years frontend development.\nCompany: Example Lab.\nSkills: React, TypeScript, Next.js.\nProject: Built React admin dashboard with TypeScript and optimized rendering performance.\nBase: Hangzhou.\nPreferred location: Shanghai.\nEarliest available: 2026-12-01.";
function profile() {
  const fact = (value, evidence = value) => ({ value, evidence, source: "RESUME" });
  return { name: fact("Demo Candidate Q"), education: fact("Bachelor"), school: fact("Demo University"), company: fact("Example Lab"), experienceYears: fact(4, "4 years frontend development"), currentBase: fact("Hangzhou"), desiredLocation: fact("Shanghai"), earliestStart: fact("2026-12-01"), skills: [fact("React"), fact("TypeScript"), fact("Next.js")], experiences: [fact("4 years frontend development")], projects: [fact("Built React admin dashboard with TypeScript and optimized rendering performance")] };
}
function pdf(value = text) {
  const stream = value ? `BT /F1 11 Tf 40 780 Td 16 TL ${value.split("\n").map(line => `(${line.replace(/[()\\]/g, c => "\\" + c)}) Tj T*`).join("\n")} ET` : "";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 700 840] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let out = "%PDF-1.4\n", offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(out); out += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}
module.exports = { text, profile, pdf };
