"use client";

import React from "react";

// A deliberately small renderer for model answers: paragraphs, lists, bold, inline code,
// simple LaTeX cleanup, and [n] citations that point at the evidence passages.

function cleanMath(s: string): string {
  return s
    .replace(/\\text\{([^}]*)\}/g, "$1")
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1) / ($2)")
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\left|\\right/g, "")
    .replace(/\$\$([^$]+)\$\$/g, "$1")
    .replace(/\\\(|\\\)/g, "");
}

const CITE = /\[(?:Source\s*)?(\d+(?:\s*(?:,|and)\s*(?:Source\s*)?\d+)*)\]/gi;

function inline(text: string, onCite: (n: number) => void, maxCite: number, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // split on bold and code first
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  parts.forEach((part, i) => {
    const k = `${key}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      out.push(<strong key={k}>{inline(part.slice(2, -2), onCite, maxCite, k)}</strong>);
      return;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      out.push(<code key={k}>{part.slice(1, -1)}</code>);
      return;
    }
    let last = 0;
    let m: RegExpExecArray | null;
    CITE.lastIndex = 0;
    while ((m = CITE.exec(part))) {
      if (m.index > last) out.push(part.slice(last, m.index));
      const nums = m[1].match(/\d+/g)!.map(Number).filter((n) => n >= 1 && n <= maxCite);
      if (nums.length === 0) {
        out.push(m[0]);
      } else {
        nums.forEach((n) => {
          out.push(
            <button key={`${k}-c${m!.index}-${n}`} type="button" className="cite" onClick={() => onCite(n)} aria-label={`Show passage ${n}`}>
              {n}
            </button>,
          );
        });
      }
      last = m.index + m[0].length;
    }
    if (last < part.length) out.push(part.slice(last));
  });
  return out;
}

export function Markdown({ text, onCite, maxCite }: { text: string; onCite: (n: number) => void; maxCite: number }) {
  const blocks = cleanMath(text.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `\n\n§MATH§${m.trim()}\n\n`))
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <>
      {blocks.map((block, bi) => {
        const key = `b${bi}`;
        if (block.startsWith("§MATH§")) {
          return (
            <p key={key} className="math">
              {block.slice(6)}
            </p>
          );
        }
        const lines = block.split("\n");
        const isUl = lines.every((l) => /^\s*[-*•]\s+/.test(l));
        const isOl = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
        if (isUl || isOl) {
          const items = lines.map((l, li) => (
            <li key={`${key}-${li}`}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), onCite, maxCite, `${key}-${li}`)}</li>
          ));
          return isOl ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
        }
        if (/^#{1,6}\s/.test(block)) {
          return (
            <p key={key} className="answer-heading">
              {inline(block.replace(/^#{1,6}\s+/, ""), onCite, maxCite, key)}
            </p>
          );
        }
        // mixed block: a lead line followed by list items
        const firstItem = lines.findIndex((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
        if (firstItem > 0 && lines.slice(firstItem).every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
          const ordered = /^\s*\d/.test(lines[firstItem]);
          const items = lines.slice(firstItem).map((l, li) => (
            <li key={`${key}-${li}`}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), onCite, maxCite, `${key}-${li}`)}</li>
          ));
          return (
            <React.Fragment key={key}>
              <p>{inline(lines.slice(0, firstItem).join(" "), onCite, maxCite, `${key}-lead`)}</p>
              {ordered ? <ol>{items}</ol> : <ul>{items}</ul>}
            </React.Fragment>
          );
        }
        return <p key={key}>{inline(lines.join(" "), onCite, maxCite, key)}</p>;
      })}
    </>
  );
}
