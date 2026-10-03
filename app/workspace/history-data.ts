import type { Criterion } from "./api";
export type Row = Record<string, unknown>;
export function parseHistory(value: unknown) {
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rows = (key: string): Row[] => Array.isArray(body[key]) ? body[key].filter((r: unknown) => r !== null && typeof r === "object" && !Array.isArray(r)) : [];
  return { spec_versions: rows("spec_versions"), feedback: rows("feedback"), proposals: rows("proposals"), audit: rows("audit") };
}
export function historySnapshots(value: unknown): Record<number, Criterion[]> {
  const result: Record<number, Criterion[]> = {};
  for (const row of parseHistory(value).spec_versions) {
    if (!Number.isSafeInteger(row.version) || Number(row.version) < 1 || !Array.isArray(row.criteria)) continue;
    if (row.criteria.every((c) => c && typeof c.id === "string" && typeof c.text === "string" && ["MUST_HAVE", "NICE_TO_HAVE", "VETO"].includes(c.type) && Number.isFinite(c.weight))) result[Number(row.version)] = row.criteria as Criterion[];
  }
  return result;
}
export function diffCriteria(before: Criterion[], after: Criterion[]) {
  const rows: { kind: "add" | "mod" | "del"; before?: Criterion; after?: Criterion }[] = [];
  for (const item of before) {
    const next = after.find((entry) => entry.id === item.id);
    if (!next) rows.push({ kind: "del", before: item });
    else if (next.text !== item.text || next.type !== item.type || next.weight !== item.weight) rows.push({ kind: "mod", before: item, after: next });
  }
  for (const item of after) if (!before.some((entry) => entry.id === item.id)) rows.push({ kind: "add", after: item });
  return rows;
}
