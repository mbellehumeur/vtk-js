#!/usr/bin/env python3
"""Generate NLST lung-screening worklist manifest for the CastClient example.

Selects one CT series per study: highest instanceCount among series with
instanceCount <= 300, regularly_spaced_3d_volume, and series_size_MB < 20.

Requires: pip install idc-index

See https://learn.canceridc.dev/data/downloading-data/direct-loading
"""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import quote

from idc_index import IDCClient

OUT_PATH = (
    Path(__file__).resolve().parent.parent / "idc-data" / "idc-lung-screen-manifest.json"
)

COLLECTION_ID = "nlst"
SOURCE_BUCKET = "aws"
MAX_SLICES = 300
MAX_SIZE_MB = 20
STUDY_LIMIT = 10

LUNG_SCREEN_QUERY = f"""
    WITH eligible AS (
        SELECT
            i.collection_id,
            i.PatientID,
            i.StudyInstanceUID,
            i.SeriesInstanceUID,
            i.SeriesDescription,
            i.instanceCount,
            i.series_size_MB,
            i.license_short_name
        FROM index i
        JOIN volume_geometry_index v
          ON i.SeriesInstanceUID = v.SeriesInstanceUID
        WHERE i.collection_id = '{COLLECTION_ID}'
          AND i.Modality = 'CT'
          AND v.regularly_spaced_3d_volume = TRUE
          AND i.instanceCount <= {MAX_SLICES}
          AND i.series_size_MB < {MAX_SIZE_MB}
    ),
    one_series_per_study AS (
        SELECT
            *,
            ROW_NUMBER() OVER (
                PARTITION BY StudyInstanceUID
                ORDER BY instanceCount DESC, series_size_MB ASC, SeriesInstanceUID
            ) AS rn
        FROM eligible
    )
    SELECT
        collection_id,
        PatientID,
        StudyInstanceUID,
        SeriesInstanceUID,
        SeriesDescription,
        instanceCount,
        series_size_MB,
        license_short_name
    FROM one_series_per_study
    WHERE rn = 1
    ORDER BY instanceCount DESC, series_size_MB ASC
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


def build_study_entry(client: IDCClient, row, index: int) -> dict:
    series_uid = str(row["SeriesInstanceUID"])
    study_uid = str(row["StudyInstanceUID"])
    patient_id = str(row["PatientID"])
    slice_count = int(row["instanceCount"])
    size_mb = float(row["series_size_MB"])
    description_raw = str(row.get("SeriesDescription") or "").strip()
    description = (
        f"NLST chest CT — {patient_id}"
        + (f" — {description_raw}" if description_raw else "")
    )

    urls = client.get_series_file_URLs(
        seriesInstanceUID=series_uid,
        source_bucket_location=SOURCE_BUCKET,
    )
    if len(urls) != slice_count:
        print(
            f"warn nlst-lung-{index:02d}: URL count {len(urls)} != "
            f"instanceCount {slice_count}"
        )
    if len(urls) > MAX_SLICES:
        raise ValueError(
            f"nlst-lung-{index:02d}: {len(urls)} files exceeds MAX_SLICES {MAX_SLICES}"
        )

    return {
        "id": f"nlst-lung-{index:02d}",
        "name": f"NLST lung screen {index}",
        "description": description,
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
    client.fetch_index("volume_geometry_index")

    rows = client.sql_query(LUNG_SCREEN_QUERY)
    if rows.empty:
        raise SystemExit("No NLST lung-screening series matched filters")

    if len(rows) < STUDY_LIMIT:
        print(f"warn: only {len(rows)} studies matched (wanted {STUDY_LIMIT})")

    studies = []
    for index, (_, row) in enumerate(rows.iterrows(), start=1):
        entry = build_study_entry(client, row, index)
        studies.append(entry)
        print(
            f"nlst-lung-{index:02d}: {entry['instanceCount']} slices, "
            f"{entry['size']}, study={row['StudyInstanceUID']}"
        )

    manifest = {
        "organization": "idc-lung-screen",
        "organizationLabel": "IDC - CT Lung Screenings",
        "collection_id": COLLECTION_ID,
        "studies": studies,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"wrote {OUT_PATH} ({len(studies)} studies)")


if __name__ == "__main__":
    main()
