import { diffLines, diffWordsWithSpace } from "diff";

export type LineType = "add" | "del" | "ctx";
export type WordOpType = "add" | "del" | "eq";

export interface WordOp {
  type: WordOpType;
  text: string;
}

export interface DiffLine {
  type: LineType;
  oldNum: number | null;
  newNum: number | null;
  content: string;
  wordOps?: WordOp[];
}

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const parts = diffLines(oldText, newText);
  const out: DiffLine[] = [];
  let oldNum = 1;
  let newNum = 1;
  for (const p of parts) {
    const lines = stripTrailingNewline(p.value).split("\n");
    for (const line of lines) {
      if (p.added) {
        out.push({ type: "add", oldNum: null, newNum: newNum++, content: line });
      } else if (p.removed) {
        out.push({ type: "del", oldNum: oldNum++, newNum: null, content: line });
      } else {
        out.push({ type: "ctx", oldNum: oldNum++, newNum: newNum++, content: line });
      }
    }
  }
  pairWordDiffs(out);
  return out;
}

function pairWordDiffs(lines: DiffLine[]): void {
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type !== "del") {
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && lines[j].type === "del") j++;
    const delCount = j - i;
    let k = j;
    while (k < lines.length && lines[k].type === "add") k++;
    const addCount = k - j;
    if (delCount > 0 && delCount === addCount) {
      for (let m = 0; m < delCount; m++) {
        const dl = lines[i + m];
        const al = lines[j + m];
        const parts = diffWordsWithSpace(dl.content, al.content);
        const delOps: WordOp[] = [];
        const addOps: WordOp[] = [];
        for (const p of parts) {
          if (p.added) {
            addOps.push({ type: "add", text: p.value });
          } else if (p.removed) {
            delOps.push({ type: "del", text: p.value });
          } else {
            delOps.push({ type: "eq", text: p.value });
            addOps.push({ type: "eq", text: p.value });
          }
        }
        if (delOps.some((o) => o.type === "eq")) dl.wordOps = delOps;
        if (addOps.some((o) => o.type === "eq")) al.wordOps = addOps;
      }
    }
    i = k > i ? k : i + 1;
  }
}

function stripTrailingNewline(s: string): string {
  return s.endsWith("\n") ? s.slice(0, -1) : s;
}
