// Everything that makes this site about health lives in this one file.
// To make a site about another subject, put new .txt files in data/docs and edit this file.

export const SITE = {
  name: "Ask the Health Library",
  description:
    "Ask questions about common health conditions. Answers come from NIH patient guides, with the passages they came from.",

  introTitle: "Ask a health question",
  introLead:
    "Answers come only from NIH patient guides on 47 common health topics, and every answer shows the passages it was built from.",
  placeholder: "Ask about diabetes, asthma, anemia, hepatitis…",

  suggestions: [
    { q: "What are the symptoms of iron-deficiency anemia?" },
    { q: "How is type 2 diabetes diagnosed?" },
    { q: "How does tuberculosis spread?" },
    { q: "What can I do to lower my blood pressure?" },
    { q: "What is long COVID?", note: "Not in the library. A good test of “I do not know”." },
  ] as { q: string; note?: string }[],

  /** Shown under the question box on every visit. */
  disclaimer:
    "General health information, not medical advice. The guides date from around 2017, so some advice may have changed. For a diagnosis or treatment, see a doctor. In an emergency, call your local emergency number.",

  /** Shown at the bottom of every page. The dataset licence (CC BY 4.0) requires credit. */
  credit:
    "Content from MedQuAD (Ben Abacha and Demner-Fushman, 2019), built from U.S. National Institutes of Health pages, used under CC BY 4.0. Not affiliated with or endorsed by NIH.",

  /** Below this top similarity, the library probably does not cover the question.
   *  0.40 came from the course notes. Check it on this corpus: ask questions you know
   *  are covered and ones you know are not, and set the line between their top scores. */
  coverageThreshold: 0.4,

  systemPromptWithNotes:
    "You answer health questions for the public using only passages from NIH patient guides. " +
    "Write plainly: two to six sentences, or a short list when the passages give steps. " +
    "Do not diagnose the person, do not give medicine doses, and do not tell anyone to start or stop a medicine. " +
    "If the question mentions emergency signs, such as chest pain, trouble breathing, sudden weakness or numbness on one side, " +
    "or thoughts of self-harm, first tell them to get emergency care now. " +
    "When the question is about the person's own symptoms or treatment, end with one short line suggesting they talk to a doctor.",

  systemPromptWithoutNotes: "You are a helpful assistant. Answer the health question briefly.",

  /** Words for the Library page. */
  libraryTitle: "What the library contains",
  libraryNoun: "guides",

  /** How many topics the guides cover (shown in the stats row). */
  topicCount: 47,

  /** Short name for the logo in the top bar. */
  brand: "Health Library",

  /** Short line under the chat box, like other AI chat tools. */
  shortDisclaimer: "General health information from NIH guides, not medical advice. Check with a doctor.",

  /** Example questions on the start screen: a short title and the full question. */
  starters: [
    { title: "Anemia symptoms", q: "What are the symptoms of iron-deficiency anemia?" },
    { title: "Diabetes tests", q: "How is type 2 diabetes diagnosed?" },
    { title: "How TB spreads", q: "How does tuberculosis spread?" },
    { title: "Lower blood pressure", q: "What can I do to lower my blood pressure?" },
  ],
} as const;
