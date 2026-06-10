#!/usr/bin/env python3
"""Generate pleural / lung ultrasound worklist manifest for the CastClient example.

IDC has **no** ultrasound series whose metadata contains ``pleura``. The closest
pleural imaging in IDC is **thoracentesis** US (``cmb_lca``) plus one **US_Chest**
series (``cmb_crc``). This script lists those series only (no liver-biopsy filler).

Requires: pip install idc-index

See https://learn.canceridc.dev/data/downloading-data/direct-loading
"""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import quote

from idc_index import IDCClient

OUT_PATH = (
    Path(__file__).resolve().parent.parent
    / "idc-data"
    / "idc-lung-us-manifest.json"
)

SOURCE_BUCKET = "aws"
STUDY_LIMIT = 10
MAX_INSTANCES = 64

# Manually removed from worklist.
EXCLUDED_SERIES_UIDS = frozenset(
    {
        # Pleural US 2 — duplicate thoracentesis series for MSB-02120.
        "1.3.6.1.4.1.14519.5.2.1.9041201102512044379005074501239371342",
        # Pleural US 5 — cmb_crc US_Chest MSB-08588.
        "1.3.6.1.4.1.14519.5.2.1.1.22157061838391240551272903381228130965",
    }
)

# Series-level selection (multiple thoracentesis series per study are kept).
PLEURAL_US_QUERY = f"""
    SELECT
        collection_id,
        PatientID,
        StudyInstanceUID,
        StudyDescription,
        SeriesDescription,
        instanceCount,
        series_size_MB,
        SeriesInstanceUID,
        license_short_name,
        CASE
            WHEN lower(coalesce(StudyDescription, '')) LIKE '%pleur%'
              OR lower(coalesce(SeriesDescription, '')) LIKE '%pleur%'
              OR lower(coalesce(BodyPartExamined, '')) LIKE '%pleur%' THEN 100
            WHEN lower(coalesce(StudyDescription, '')) LIKE '%thoracent%'
              OR lower(coalesce(SeriesDescription, '')) LIKE '%thoracent%' THEN 95
            WHEN lower(coalesce(StudyDescription, '')) LIKE '%chest%' THEN 85
            ELSE 0
        END AS relevance_score
    FROM index
    WHERE Modality = 'US'
      AND instanceCount <= {MAX_INSTANCES}
      AND (
        lower(coalesce(StudyDescription, '')) LIKE '%pleur%'
        OR lower(coalesce(SeriesDescription, '')) LIKE '%pleur%'
        OR lower(coalesce(BodyPartExamined, '')) LIKE '%pleur%'
        OR lower(coalesce(StudyDescription, '')) LIKE '%thoracent%'
        OR lower(coalesce(SeriesDescription, '')) LIKE '%thoracent%'
        OR lower(coalesce(StudyDescription, '')) LIKE '%chest%'
      )
    ORDER BY
        relevance_score DESC,
        instanceCount DESC,
        series_size_MB DESC,
        SeriesInstanceUID
    LIMIT {STUDY_LIMIT}
"""


def s3_uri_to_public_https(url: str) -> str:
    """Map idc_index s3:// URLs to anonymous HTTPS object URLs for browser fetch."""
    if not url.startswith("s3://"):
        return url
    without_scheme = url[5:]
    bucket, _, key = without_scheme.partition("/")
    if not bucket or not key:
        return url
    encoded_key = "/".join(quote(segment, safe="") for segment in key.split("/"))
    return f"https://{bucket}.s3.amazonaws.com/{encoded_key}"


def format_size_mb(value: float) -> str:
    if value < 1:
        return f"{value:.1f} MB"
    return f"{int(round(value))} MB"


def build_description(row) -> str:
    collection_id = str(row["collection_id"])
    patient_id = str(row["PatientID"])
    study_desc = str(row.get("StudyDescription") or "").strip()
    series_desc = str(row.get("SeriesDescription") or "").strip()
    detail = study_desc or series_desc or "Ultrasound"
    if series_desc and study_desc and series_desc.lower() != study_desc.lower():
        detail = f"{study_desc} — {series_desc}"
    return f"{collection_id} US — {patient_id} — {detail}"


def build_short_name(row) -> str:
    study_desc = str(row.get("StudyDescription") or "").strip()
    series_desc = str(row.get("SeriesDescription") or "").strip()
    label = study_desc or series_desc or "US"
    return label.replace(" ", "_")[:28]


def build_study_entry(client: IDCClient, row, index: int) -> dict:
    series_uid = str(row["SeriesInstanceUID"])
    study_uid = str(row["StudyInstanceUID"])
    slice_count = int(row["instanceCount"])
    size_mb = float(row["series_size_MB"])
    short_name = build_short_name(row)

    urls = client.get_series_file_URLs(
        seriesInstanceUID=series_uid,
        source_bucket_location=SOURCE_BUCKET,
    )
    if len(urls) != slice_count:
        print(
            f"warn idc-lung-us-{index:02d}: URL count {len(urls)} != "
            f"instanceCount {slice_count}"
        )
    if len(urls) > MAX_INSTANCES:
        raise ValueError(
            f"idc-lung-us-{index:02d}: {len(urls)} files exceeds "
            f"MAX_INSTANCES {MAX_INSTANCES}"
        )

    return {
        "id": f"idc-lung-us-{index:02d}",
        "name": f"Pleural US {index} ({short_name})",
        "description": build_description(row),
        "size": format_size_mb(size_mb),
        "format": "DICOM",
        "studyInstanceUID": study_uid,
        "seriesInstanceUID": series_uid,
        "sourceBucket": SOURCE_BUCKET,
        "instanceCount": slice_count,
        "files": [
            {
                "url": s3_uri_to_public_https(url),
                "fileName": url.rsplit("/", 1)[-1],
            }
            for url in urls
        ],
    }


def main() -> None:
    client = IDCClient()
    rows = client.sql_query(PLEURAL_US_QUERY)
    if EXCLUDED_SERIES_UIDS:
        rows = rows[~rows["SeriesInstanceUID"].isin(EXCLUDED_SERIES_UIDS)]
    if rows.empty:
        raise SystemExit(
            "No IDC pleural/thoracentesis/chest ultrasound series matched filters"
        )

    if len(rows) < STUDY_LIMIT:
        print(
            f"warn: only {len(rows)} series matched (wanted up to {STUDY_LIMIT}); "
            "IDC has no US series tagged 'pleura' — thoracentesis + US_Chest only"
        )

    studies = []
    for index, (_, row) in enumerate(rows.iterrows(), start=1):
        entry = build_study_entry(client, row, index)
        studies.append(entry)
        print(
            f"idc-lung-us-{index:02d}: score={row['relevance_score']} "
            f"{entry['instanceCount']} frames, {entry['size']}, "
            f"patient={row['PatientID']}"
        )

    collection_ids = sorted({str(row["collection_id"]) for _, row in rows.iterrows()})

    manifest = {
        "organization": "idc-lung-us",
        "organizationLabel": "IDC - Lung Ultrasound",
        "ohifMode": "usAnnotation",
        "collection_ids": collection_ids,
        "selectionNote": (
            "IDC has no ultrasound series labeled pleura; list is thoracentesis "
            "and chest US from cmb_lca / cmb_crc."
        ),
        "studies": studies,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"wrote {OUT_PATH} ({len(studies)} studies)")


if __name__ == "__main__":
    main()
