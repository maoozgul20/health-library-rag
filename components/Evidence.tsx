"use client";

import React from "react";
import { COVERAGE_THRESHOLD } from "@/lib/search";
import { tokenize } from "@/lib/tfidf";
import type { Hit, SearchMode } from "@/lib/types";

const STOP = new Set(
  "the and for are but not you your with what which who how why when where does did can could should would this that these those from into about than then them they their there here have has had was were been being its it's is of to in on at by an as or be do a i me my we our use used using".split(
    " ",
  ),
);

/** Collapse blank lines and stray spaces so a passage reads as compact text. */
export function tidy(text: string): string {
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").trim();
}

function queryTerms(q: string): string[] {
  return [...new Set(tokenize(q).filter((t) => t.length >= 3 && !STOP.has(t)))];
}

/** Wrap words in the passage that match the question in a highlighter mark. */
export function Highlighted({ text, question }: { text: string; question: string }) {
  const terms = queryTerms(question);
  if (terms.length === 0) return <>{text}</>;
  const parts = text.split(/([\p{L}\p{N}_]+)/u);
  return (
    <>
      {parts.map((p, i) => {
        const w = p.toLowerCase();
        const hit = terms.some((t) => w === t || (t.length >= 4 && w.startsWith(t) && w.length - t.length <= 3) || (w.length >= 4 && t.startsWith(w) && t.length - w.length <= 2));
        return hit ? <mark key={i}>{p}</mark> : <React.Fragment key={i}>{p}</React.Fragment>;
      })}
    </>
  );
}

export function ScoreMeter({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const covered = value >= COVERAGE_THRESHOLD;
  return (
    <span className={`meter ${covered ? "is-covered" : "is-uncovered"}`} role="img" aria-label={`${label ?? "Similarity"} ${value.toFixed(2)}`}>
      <span className="meter-track">
        <span className="meter-fill" style={{ width: `${pct}%` }} />
        <span className="meter-tick" style={{ left: `${COVERAGE_THRESHOLD * 100}%` }} />
      </span>
      <span className="meter-value">{value.toFixed(2)}</span>
    </span>
  );
}

export function Verdict({ hits }: { hits: Hit[] }) {
  const top = hits[0]?.semantic;
  if (top == null) {
    return <p className="verdict">Matched on exact words only, so there is no meaning score to judge coverage by.</p>;
  }
  const best = Math.max(...hits.map((h) => h.semantic ?? 0));
  if (best >= COVERAGE_THRESHOLD) {
    return (
      <p className="verdict is-covered">
        The library covers this. Best match {best.toFixed(2)}, above the {COVERAGE_THRESHOLD.toFixed(2)} line.
      </p>
    );
  }
  return (
    <p className="verdict is-uncovered">
      The library probably does not cover this. Best match {best.toFixed(2)}, below the {COVERAGE_THRESHOLD.toFixed(2)} line, so treat any answer with care.
    </p>
  );
}

const MODE_LABEL: Record<SearchMode, string> = {
  semantic: "meaning",
  hybrid: "meaning and exact words",
  keyword: "exact words",
};

export function EvidenceList({
  hits,
  question,
  mode,
  active,
  idPrefix,
}: {
  hits: Hit[];
  question: string;
  mode: SearchMode;
  active: number | null;
  idPrefix: string;
}) {
  if (hits.length === 0) {
    return <p className="empty-note">No passage shares a word with this question. Rephrase it, or switch search to meaning.</p>;
  }
  return (
    <>
      <Verdict hits={hits} />
      <ol className="evidence-list">
        {hits.map((h, i) => (
          <li key={h.id} id={`${idPrefix}-${i + 1}`} className={`passage ${active === i + 1 ? "is-active" : ""}`}>
            <div className="passage-head">
              <span className="passage-num" aria-hidden="true">
                {i + 1}
              </span>
              <span className="passage-source" title={h.source}>
                {h.docTitle}
              </span>
              {h.semantic != null && <ScoreMeter value={h.semantic} />}
            </div>
            <p className="passage-text">
              <Highlighted text={tidy(h.text)} question={question} />
            </p>
            <p className="passage-foot">
              {h.source}, chunk {h.id + 1}
              {mode === "hybrid" && <>, combined score {h.score.toFixed(2)}</>}
              {mode === "keyword" && <>, keyword score {h.keyword.toFixed(2)}</>}
            </p>
          </li>
        ))}
      </ol>
      <p className="evidence-note">
        Ranked by {MODE_LABEL[mode]}.
        {hits[0]?.semantic != null && <> The mark on each meter is the {COVERAGE_THRESHOLD.toFixed(2)} coverage line.</>}
      </p>
    </>
  );
}
