# About the documents in data/docs

The 13 text files are built from **MedQuAD**, the Medical Question Answering Dataset:

> Asma Ben Abacha and Dina Demner-Fushman. "A Question-Entailment Approach to Question
> Answering." BMC Bioinformatics, 20(1):511, 2019. https://github.com/abachaa/MedQuAD

MedQuAD is licensed under **Creative Commons Attribution 4.0 (CC BY 4.0)**,
https://creativecommons.org/licenses/by/4.0/. Its question and answer pairs come from
U.S. National Institutes of Health websites: NIHSeniorHealth, NIDDK, NHLBI, NINDS and CDC.

Changes made: 47 topics were selected and grouped into 13 files by body system,
questions about research programs and clinical trials were left out, repeated answers
were removed, and spacing and leftover link text were cleaned up. Each topic keeps the
URL of its original page. Some original pages had special characters (dashes, accents)
stripped by the dataset, so a few words run together.

The pages date from around 2017. This is general health information, not medical advice.
This project is not affiliated with or endorsed by NIH.

To change the topics: download MedQuAD from GitHub, edit the FILES list in
scripts/build_medical_docs.py, then run
`python scripts/build_medical_docs.py path/to/MedQuAD data/docs`.
