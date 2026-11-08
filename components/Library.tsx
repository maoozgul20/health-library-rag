"use client";

import { useState } from "react";
import type { LoadedIndex } from "@/lib/search";
import { SITE } from "@/lib/site";
import { tidy } from "./Evidence";

const PAGE = 8;

export function Library({ index }: { index: LoadedIndex }) {
  const { meta, docs, chunks } = index;
  const [open, setOpen] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const fmt = (n: number) => n.toLocaleString("en-US");

  return (
    <div className="library">
      <section className="library-intro">
        <span className="chip">Files</span>
        <h2 className="page-title">{SITE.libraryTitle}</h2>
        <p className="lead">
          Every answer comes from these {docs.length} files of {SITE.libraryNoun}. They were cut into {fmt(chunks.length)} passages of up to{" "}
          {meta.chunkSize} characters, each sharing {meta.chunkOverlap} characters with the next, and every passage was turned
          into a {meta.dim}-number vector.
        </p>
        <dl className="facts">
          <div>
            <dt>Documents</dt>
            <dd>{docs.length}</dd>
          </div>
          <div>
            <dt>Characters</dt>
            <dd>{fmt(meta.totalChars)}</dd>
          </div>
          <div>
            <dt>Passages</dt>
            <dd>{fmt(chunks.length)}</dd>
          </div>
          <div>
            <dt>Average passage</dt>
            <dd>{meta.avgChunk} chars</dd>
          </div>
        </dl>
        {!index.vectors && (
          <p className="notice">
            This build has no embeddings, so search matches exact words only. Redeploy with internet access, or run{" "}
            <code>npm run index</code> locally and commit <code>public/index</code>.
          </p>
        )}
      </section>

      <section className="pipeline" aria-labelledby="pipeline-title">
        <h2 id="pipeline-title">How a question gets answered</h2>
        <ol>
          <li>
            <strong>Your browser embeds the question</strong> with {meta.model.replace("Xenova/", "")}, the model that embedded the
            passages.
          </li>
          <li>
            <strong>It compares that vector with all {fmt(chunks.length)} passages</strong>, an exact search like FAISS
            IndexFlatIP, and keeps the top few.
          </li>
          <li>
            <strong>The server wraps them in a prompt</strong> that says to answer only from the passages, or say “I do not know”.
          </li>
          <li>
            <strong>The AI model writes the answer</strong> at temperature 0.2, citing passages by number.
          </li>
        </ol>
      </section>

      <section aria-labelledby="files-title">
        <h2 id="files-title">Files</h2>
        <ul className="doc-list">
          {docs.map((d) => {
            const isOpen = open === d.file;
            const slice = chunks.slice(d.firstChunk, d.firstChunk + d.chunks);
            const pages = Math.ceil(slice.length / PAGE);
            return (
              <li key={d.file} className={`doc ${isOpen ? "is-open" : ""}`}>
                <button
                  type="button"
                  className="doc-row"
                  aria-expanded={isOpen}
                  onClick={() => {
                    setOpen(isOpen ? null : d.file);
                    setPage(0);
                  }}
                >
                  <span className="doc-title">{d.title}</span>
                  <span className="doc-kind">{d.kind}</span>
                  <span className="doc-count">
                    {d.chunks} passages
                  </span>
                </button>
                {isOpen && (
                  <div className="doc-body">
                    <p className="doc-meta">
                      {d.file}, {fmt(d.chars)} characters
                    </p>
                    <ol className="chunk-list" start={page * PAGE + 1}>
                      {slice.slice(page * PAGE, page * PAGE + PAGE).map((c, i) => (
                        <li key={i}>
                          <p>{tidy(c.t)}</p>
                          <span className="chunk-len">{c.t.length} characters</span>
                        </li>
                      ))}
                    </ol>
                    {pages > 1 && (
                      <div className="pager">
                        <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>
                          Previous
                        </button>
                        <span>
                          Page {page + 1} of {pages}
                        </span>
                        <button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
