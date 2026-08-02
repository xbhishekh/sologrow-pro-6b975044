// Shared SQL literal helpers for one-time migration exports.
export function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "object") return quote(JSON.stringify(v)) + "::jsonb";
  return quote(String(v));
}

export function quote(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

export function ident(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}

export function buildInsert(table: string, rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const colList = cols.map(ident).join(", ");
  const values = rows
    .map((r) => "  (" + cols.map((c) => sqlLiteral(r[c])).join(", ") + ")")
    .join(",\n");
  return `INSERT INTO public.${ident(table)} (${colList}) VALUES\n${values}\nON CONFLICT DO NOTHING;\n`;
}