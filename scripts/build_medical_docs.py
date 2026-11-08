"""Build a medical RAG corpus from MedQuAD (CC BY 4.0) as plain text files.

Usage: python3 build_medical_docs.py <MedQuAD dir> <output dir>
One file per body system, one section per condition, each section a list of
question and answer pairs from the original NIH page.
"""
import html
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

SRC_NAMES = {
    "1_CancerGov_QA": "National Cancer Institute (cancer.gov)",
    "5_NIDDK_QA": "National Institute of Diabetes and Digestive and Kidney Diseases (NIDDK)",
    "6_NINDS_QA": "National Institute of Neurological Disorders and Stroke (NINDS)",
    "7_SeniorHealth_QA": "NIHSeniorHealth",
    "8_NHLBI_QA_XML": "National Heart, Lung, and Blood Institute (NHLBI)",
    "9_CDC_QA": "Centers for Disease Control and Prevention (CDC)",
}

# question types that are mostly about research programs or clinical trials, not patients
SKIP_QTYPES = {"research", "considerations", "stages"}

S, ND, NI, NH, CD = "7_SeniorHealth_QA", "5_NIDDK_QA", "6_NINDS_QA", "8_NHLBI_QA_XML", "9_CDC_QA"

FILES = [
    ("01_diabetes_and_thyroid", "Diabetes and Thyroid", [
        (S, "Diabetes"), (ND, "Diagnosis of Diabetes and Prediabetes"),
        (ND, "What I need to know about Gestational Diabetes"),
        (ND, "Hypothyroidism")]),
    ("02_heart_and_blood_pressure", "Heart and Blood Pressure", [
        (S, "High Blood Pressure"), (NH, "Heart Attack"), (NH, "High Blood Cholesterol")]),
    ("03_brain_and_nerves", "Brain and Nerves", [
        (S, "Stroke"), (NI, "Migraine"), (NI, "Epilepsy")]),
    ("04_lungs_and_breathing", "Lungs and Breathing", [
        (NH, "Asthma"), (S, "COPD"), (NH, "Pneumonia"), (NH, "Sleep Apnea")]),
    ("05_digestive_system_and_liver", "Digestive System and Liver", [
        (ND, "Celiac Disease"), (ND, "Gastritis"), (ND, "Gallstones"), (ND, "Lactose Intolerance"),
        (ND, "Viral Gastroenteritis"), (ND, "What I need to know about Hepatitis B"),
        (ND, "What I need to know about Hepatitis C"), (ND, "What I need to know about Cirrhosis")]),
    ("06_kidneys_and_urinary_tract", "Kidneys and Urinary Tract", [
        (S, "Kidney Disease"), (ND, "Kidney Stones in Adults"), (ND, "Urinary Tract Infection In Adults")]),
    ("07_blood_disorders", "Blood Disorders", [
        (NH, "Anemia"), (NH, "Iron-Deficiency Anemia"), (NH, "Thalassemias")]),
    ("08_infections", "Infections", [
        (CD, "Tuberculosis (TB)"), (CD, "Typhoid Fever"), (CD, "Rabies"), (S, "Shingles"),
        (ND, "Foodborne Illnesses"), (CD, "Parasites - Scabies")]),
    ("09_bones_and_joints", "Bones and Joints", [
        (S, "Osteoporosis"), (S, "Osteoarthritis")]),
    ("10_cancer", "Cancer", [
        (S, "Breast Cancer"), (S, "Colorectal Cancer"), (S, "Lung Cancer")]),
    ("11_mental_health_and_sleep", "Mental Health and Sleep", [
        (S, "Depression"), (S, "Anxiety Disorders"), (NH, "Insomnia")]),
    ("12_eyes_and_ears", "Eyes and Ears", [
        (S, "Cataract"), (S, "Glaucoma"), (S, "Hearing Loss")]),
    ("13_weight_and_lifestyle", "Weight and Lifestyle", [
        (NH, "Overweight and Obesity"), (NH, "Metabolic Syndrome")]),
]


def clean_question(q: str) -> str:
    q = re.sub(r"\s+", " ", q).strip()
    q = q.replace("What is (are)", "What is").replace("Who should get", "Who should get")
    q = re.sub(r"\s+\?", "?", q)
    q = re.sub(r"\(\?\)", "", q).strip()
    return q


def clean_answer(a: str) -> str:
    a = html.unescape(a)
    a = re.sub(r"(?m)^\s*Espa.?ol\s*$", "", a)
    a = re.sub(r"\(Watch the video[^)]*\)", "", a)
    lines = [re.sub(r"[ \t]+", " ", l).strip() for l in a.splitlines()]
    a = "\n".join(lines)
    a = re.sub(r"\n{3,}", "\n\n", a)
    return a.strip()


def index_by_focus(root: pathlib.Path, sub: str):
    out = {}
    for f in sorted((root / sub).glob("*.xml")):
        t = ET.parse(f)
        focus = (t.findtext("Focus") or "").strip()
        out.setdefault(focus, t)  # first occurrence wins
    return out


def main(src: str, dst: str):
    root, out_dir = pathlib.Path(src), pathlib.Path(dst)
    out_dir.mkdir(parents=True, exist_ok=True)
    cache = {}
    total = 0
    for fname, title, topics in FILES:
        sections = []
        for sub, focus in topics:
            if sub not in cache:
                cache[sub] = index_by_focus(root, sub)
            tree = cache[sub].get(focus)
            if tree is None:
                raise SystemExit(f"missing topic: {sub} / {focus}")
            url = tree.getroot().get("url", "")
            name = re.sub(r"^(What I need to know about|Parasites -)\s*", "", focus).strip()
            seen = set()
            parts = [f"## {name}", f"Source: {SRC_NAMES[sub]}, {url}"]
            for p in tree.iter("QAPair"):
                q_el = p.find("Question")
                ans = clean_answer(p.findtext("Answer") or "")
                if not ans or q_el is None or q_el.get("qtype") in SKIP_QTYPES:
                    continue
                key = ans[:200]
                if key in seen:
                    continue
                seen.add(key)
                parts.append(f"{clean_question(q_el.text or '')}\n{ans}")
            sections.append("\n\n".join(parts))
        names = ", ".join(re.sub(r"^(What I need to know about|Parasites -)\s*", "", f).strip() for _, f in topics)
        header = f"{title}\nCollection: {names}\n"
        text = header + "\n\n" + "\n\n\n".join(sections) + "\n"
        (out_dir / f"{fname}.txt").write_text(text)
        total += len(text)
        print(f"{fname}.txt: {len(text):,} characters")
    print(f"\nTotal: {len(FILES)} files, {total:,} characters")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
