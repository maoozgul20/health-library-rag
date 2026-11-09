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

/** A small picture for each list line, chosen from its words (shown in "rich" answers). */
const ICONS: [RegExp, string][] = [
  // \b anchors each word's start, so "treatment" is not "eat" and "early" is not "ear"
  [/\b(infant|child|bab(y|ies)|kids?\b|toddler|pregnan)/i, "👶"],
  [/\b(blood|bleed|anemi|iron\b|hemoglobin)/i, "🩸"],
  [/\b(pale|skin|rash|itch|sweat)/i, "💧"],
  [/\b(nails?|hair|tongue|mouth|lips?)\b/i, "💅"],
  [/\b(brain|head|dizz|confus|memory|nerve|seiz|stroke)/i, "🧠"],
  [/\b(heart|chest|pulse|beat|pressure)/i, "❤️"],
  [/\b(breath|lung|cough|wheez|asthma)/i, "🫁"],
  [/\b(bones?\b|joints?\b|back pain|backache|muscle)/i, "🦴"],
  [/\b(eyes?|vision|sight)\b/i, "👁️"],
  [/\b(ears?|hearing)\b/i, "👂"],
  [/\b(fever|temperature|chill)/i, "🌡️"],
  [/\b(tired|fatigue|weak|sleep|energy)/i, "😴"],
  [/\b(stomach|nausea|vomit|diarr|digest|appetite|food|eat|diet)/i, "🍽️"],
  [/\b(kidney|urin)/i, "🫘"],
  [/\b(infect|virus|viral|bacteri|spleen|immune)/i, "🦠"],
  [/\b(medic|drug|treat|pill|tablet|dose|insulin)/i, "💊"],
  [/\b(doctor|test|exam|diagnos|check)/i, "🩺"],
  [/\b(exercise|walk|active|weight)/i, "🏃"],
  [/\b(no signs?|no symptoms?|may not)\b/i, "✅"],
];
function pickIcon(raw: string) {
  for (const [re, ic] of ICONS) if (re.test(raw)) return ic;
  return "🔹";
}

function Item({ raw, rich, children }: { raw: string; rich?: boolean; children: React.ReactNode }) {
  if (!rich) return <li>{children}</li>;
  return (
    <li className="row">
      <span className="row-ico" aria-hidden="true">
        {pickIcon(raw)}
      </span>
      <span className="row-txt">{children}</span>
    </li>
  );
}

export function Markdown({
  text,
  onCite,
  maxCite,
  rich = false,
}: {
  text: string;
  onCite: (n: number) => void;
  maxCite: number;
  rich?: boolean;
}) {
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
            <Item key={`${key}-${li}`} raw={l} rich={rich}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), onCite, maxCite, `${key}-${li}`)}</Item>
          ));
          return isOl ? <ol key={key} className={rich ? "rows" : undefined}>{items}</ol> : <ul key={key} className={rich ? "rows" : undefined}>{items}</ul>;
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
            <Item key={`${key}-${li}`} raw={l} rich={rich}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), onCite, maxCite, `${key}-${li}`)}</Item>
          ));
          return (
            <React.Fragment key={key}>
              <p>{inline(lines.slice(0, firstItem).join(" "), onCite, maxCite, `${key}-lead`)}</p>
              {ordered ? <ol className={rich ? "rows" : undefined}>{items}</ol> : <ul className={rich ? "rows" : undefined}>{items}</ul>}
            </React.Fragment>
          );
        }
        return <p key={key}>{inline(lines.join(" "), onCite, maxCite, key)}</p>;
      })}
    </>
  );
}
