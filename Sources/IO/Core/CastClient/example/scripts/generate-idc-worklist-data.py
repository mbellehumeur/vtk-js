#!/usr/bin/env python3
"""Generate IDC worklist JSON (bucket URLs) for the CastClient example.

Requires: pip install idc-index

See https://learn.canceridc.dev/data/downloading-data/direct-loading
"""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import quote

from idc_index import IDCClient

OUT_DIR = Path(__file__).resolve().parent.parent / "idc-data"

# slug, StudyInstanceUID, SeriesInstanceUID (None = first series in study)
STUDIES: list[tuple[str, str, str | None]] = [
    (
        "idc-portal-demo-series-1",
        "1.3.6.1.4.1.14519.5.2.1.6279.6001.224985459390356936417021464571",
        "1.2.276.0.7230010.3.1.3.0.57823.1553343864.578877",
    ),
    (
        "idc-portal-demo-series-2",
        "1.3.6.1.4.1.14519.5.2.1.6279.6001.224985459390356936417021464571",
        "1.3.6.1.4.1.14519.5.2.1.6279.6001.273525289046256012743471155680",
    ),
    (
        "idc-portal-demo-study",
        "1.3.6.1.4.1.14519.5.2.1.6279.6001.224985459390356936417021464571",
        "1.2.276.0.7230010.3.1.3.0.57823.1553343864.578877",
    ),
]

SOURCE_BUCKET = "aws"


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


def main() -> None:
    client = IDCClient()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for slug, study_uid, series_uid in STUDIES:
        resolved_series = series_uid
        if not resolved_series:
            result = client.sql_query(
                "SELECT SeriesInstanceUID FROM index "
                f"WHERE StudyInstanceUID = '{study_uid}' LIMIT 1"
            )
            if result.empty:
                print(f"skip {slug}: no series for study")
                continue
            resolved_series = str(result.iloc[0]["SeriesInstanceUID"])

        urls = client.get_series_file_URLs(
            seriesInstanceUID=resolved_series,
            source_bucket_location=SOURCE_BUCKET,
        )
        payload = {
            "id": slug,
            "studyInstanceUID": study_uid,
            "seriesInstanceUID": resolved_series,
            "sourceBucket": SOURCE_BUCKET,
            "files": [
                {
                    "url": s3_uri_to_public_https(url),
                    "fileName": url.rsplit("/", 1)[-1],
                }
                for url in urls
            ],
        }
        out_path = OUT_DIR / f"{slug}.json"
        out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"wrote {out_path.name}: {len(urls)} files")


if __name__ == "__main__":
    main()
