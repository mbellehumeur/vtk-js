export const CAST_IMAGING_STUDY_OPEN_PROFILE =
  'http://fhircast.hl7.org/StructureDefinition/fhircast-imaging-study-open';

export const CAST_IDENTIFIER_DICOM_UID = 'urn:dicom:uid';
/** @deprecated Prefer {@link CAST_OPEN_MODE} + files context; kept for backward compatibility. */
export const CAST_IDENTIFIER_NIFTI_URL = 'urn:cast:nifti-url';
/** @deprecated Prefer files context entry ``fileName``; kept for backward compatibility. */
export const CAST_IDENTIFIER_NIFTI_FILENAME = 'urn:cast:nifti-filename';
export const CAST_IDENTIFIER_VOLVIEW_SAMPLE_ID = 'urn:cast:volview-sample-id';
export const CAST_IDENTIFIER_WORKLIST_SAMPLE_ID = 'urn:cast:worklist-sample-id';
/** OHIF mode route segment (e.g. `viewer`, `usAnnotation`). */
export const CAST_IDENTIFIER_OHIF_MODE = 'urn:cast:ohif-mode';

export const CAST_OPEN_MODE = 'urn:cast:open-mode';
export const CAST_OPEN_MODE_DICOMWEB = 'dicomweb';
export const CAST_OPEN_MODE_DICOM_URL = 'dicom-url';
export const CAST_OPEN_MODE_FILES = 'files';
export const CAST_OPEN_MODE_IDC = 'idc';

export const CAST_IDENTIFIER_IDC = 'idc';
export const CAST_IDENTIFIER_IDC_SOURCE_BUCKET = 'idc-source-bucket';

export const CAST_DICOMWEB_ROOT = 'urn:cast:dicomweb-root';

function normalizeUid(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().replace(/^urn:oid:/i, '');
}

function normalizeSystem(system) {
  return typeof system === 'string' ? system.trim().toLowerCase() : '';
}

/**
 * @param {unknown} context FHIRcast context array
 * @param {string} key e.g. study, series, files
 * @returns {Record<string, unknown> | null}
 */
export function extractStudyContextItem(context, key) {
  if (!Array.isArray(context)) {
    return null;
  }
  const normalizedKey = String(key || '')
    .trim()
    .toLowerCase();
  const item = context.find(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      typeof entry.key === 'string' &&
      entry.key.trim().toLowerCase() === normalizedKey
  );
  if (!item?.resource || typeof item.resource !== 'object') {
    return null;
  }
  return item.resource;
}

/**
 * @param {unknown} context
 * @param {string} system
 * @returns {string}
 */
export function extractIdentifierValue(context, system) {
  const studyResource = extractStudyContextItem(context, 'study');
  if (!studyResource) {
    return '';
  }
  const identifiers = Array.isArray(studyResource.identifier)
    ? studyResource.identifier
    : [];
  const want = normalizeSystem(system);
  const match = identifiers.find(
    (identifier) => normalizeSystem(identifier?.system) === want
  );
  return typeof match?.value === 'string' ? match.value.trim() : '';
}

/**
 * @param {unknown} context
 * @returns {string}
 */
export function extractDicomStudyUid(context) {
  const studyResource = extractStudyContextItem(context, 'study');
  if (!studyResource) {
    return '';
  }
  return (
    normalizeUid(studyResource.uid) ||
    normalizeUid(extractIdentifierValue(context, CAST_IDENTIFIER_DICOM_UID))
  );
}

/**
 * @param {unknown} context
 * @returns {string}
 */
export function extractDicomSeriesUid(context) {
  const seriesResource = extractStudyContextItem(context, 'series');
  if (seriesResource) {
    return normalizeUid(seriesResource.uid);
  }

  const studyResource = extractStudyContextItem(context, 'study');
  const series = Array.isArray(studyResource?.series)
    ? studyResource.series
    : [];
  const firstSeries = series[0];
  if (!firstSeries || typeof firstSeries !== 'object') {
    return '';
  }
  return normalizeUid(firstSeries.uid);
}

/**
 * @param {unknown} context
 * @returns {string}
 */
export function extractDicomwebRoot(context) {
  const value = extractIdentifierValue(context, CAST_DICOMWEB_ROOT);
  if (!value) {
    return '';
  }
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.href.replace(/\/$/, '');
    }
  } catch (err) {
    return '';
  }
  return '';
}

/**
 * @param {unknown} context
 * @returns {string}
 */
export function extractNiftiDownloadUrl(context) {
  const value = extractIdentifierValue(context, CAST_IDENTIFIER_NIFTI_URL);
  if (!value) {
    return '';
  }
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.href;
    }
  } catch (err) {
    return '';
  }
  return '';
}

/**
 * @param {unknown} context
 * @returns {string}
 */
export function extractNiftiFilename(context) {
  return extractIdentifierValue(context, CAST_IDENTIFIER_NIFTI_FILENAME);
}

/**
 * @param {unknown} context
 * @returns {string}
 */
export function extractOhifMode(context) {
  return extractIdentifierValue(context, CAST_IDENTIFIER_OHIF_MODE);
}

/**
 * @param {unknown} context
 * @returns {string}
 */
export function extractVolviewSampleId(context) {
  return (
    extractIdentifierValue(context, CAST_IDENTIFIER_VOLVIEW_SAMPLE_ID) ||
    extractIdentifierValue(context, CAST_IDENTIFIER_WORKLIST_SAMPLE_ID)
  );
}

function fileEntryUrlRaw(fileEntry) {
  if (typeof fileEntry.url === 'string') {
    return fileEntry.url.trim();
  }
  if (typeof fileEntry.uri === 'string') {
    return fileEntry.uri.trim();
  }
  return '';
}

function fileEntryNameRaw(fileEntry) {
  if (typeof fileEntry.fileName === 'string') {
    return fileEntry.fileName.trim();
  }
  if (typeof fileEntry.filename === 'string') {
    return fileEntry.filename.trim();
  }
  return '';
}

/**
 * @param {unknown} fileEntry
 * @returns {{ url: string, fileName: string, mimeType: string, role: string, label: string } | null}
 */
const ALLOWED_FILE_URL_PROTOCOLS = new Set(['http:', 'https:', 's3:', 'gs:']);

function normalizeFileEntry(fileEntry) {
  if (!fileEntry || typeof fileEntry !== 'object') {
    return null;
  }
  const urlRaw = fileEntryUrlRaw(fileEntry);
  if (!urlRaw) {
    return null;
  }
  try {
    const url = new URL(urlRaw);
    if (!ALLOWED_FILE_URL_PROTOCOLS.has(url.protocol)) {
      return null;
    }
  } catch (err) {
    return null;
  }

  const fileName = fileEntryNameRaw(fileEntry);
  const mimeType =
    typeof fileEntry.mimeType === 'string' ? fileEntry.mimeType.trim() : '';
  const role = typeof fileEntry.role === 'string' ? fileEntry.role.trim() : '';
  const label =
    typeof fileEntry.label === 'string' ? fileEntry.label.trim() : '';

  return {
    url: urlRaw,
    fileName,
    mimeType,
    role,
    label,
  };
}

/**
 * Remote files to download for ImagingStudy-open (``open-mode`` = ``files``).
 *
 * @param {unknown} context
 * @returns {Array<{ url: string, fileName: string, mimeType: string, role: string, label: string }>}
 */
export function extractImagingStudyFiles(context) {
  const filesResource = extractStudyContextItem(context, 'files');
  const rawFiles = Array.isArray(filesResource?.files)
    ? filesResource.files
    : [];
  const fromContext = rawFiles
    .map((entry) => normalizeFileEntry(entry))
    .filter((entry) => entry !== null);

  if (fromContext.length > 0) {
    return fromContext;
  }

  const legacyUrl = extractNiftiDownloadUrl(context);
  if (!legacyUrl) {
    return [];
  }
  return [
    {
      url: legacyUrl,
      fileName: extractNiftiFilename(context),
      mimeType: '',
      role: '',
      label: '',
    },
  ];
}

/**
 * SeriesInstanceUID for IDC direct bucket load (``identifier`` system ``idc``).
 *
 * @param {unknown} context
 * @returns {string}
 */
export function extractIdcSeriesUid(context) {
  return normalizeUid(extractIdentifierValue(context, CAST_IDENTIFIER_IDC));
}

/**
 * @param {unknown} context
 * @returns {'aws' | 'gcs'}
 */
export function extractIdcSourceBucket(context) {
  const value = extractIdentifierValue(
    context,
    CAST_IDENTIFIER_IDC_SOURCE_BUCKET
  ).toLowerCase();
  return value === 'gcs' ? 'gcs' : 'aws';
}

/**
 * @param {unknown} context
 * @returns {string} ``dicomweb`` | ``dicom-url`` | ``files`` | ``idc`` | ``''``
 */
export function extractOpenMode(context) {
  const explicit = extractIdentifierValue(context, CAST_OPEN_MODE);
  if (
    explicit === CAST_OPEN_MODE_DICOMWEB ||
    explicit === CAST_OPEN_MODE_DICOM_URL ||
    explicit === CAST_OPEN_MODE_FILES ||
    explicit === CAST_OPEN_MODE_IDC
  ) {
    return explicit;
  }

  const fileEntries = extractImagingStudyFiles(context);
  if (fileEntries.length > 0) {
    return CAST_OPEN_MODE_FILES;
  }

  if (extractNiftiDownloadUrl(context)) {
    return CAST_OPEN_MODE_FILES;
  }

  const studyUid = extractDicomStudyUid(context);
  if (studyUid && !extractNiftiDownloadUrl(context)) {
    return CAST_OPEN_MODE_DICOMWEB;
  }

  return '';
}

/**
 * Shared builder for file-list ImagingStudy-open contexts (files / dicom-url modes).
 */
function buildUrlFilesImagingStudyOpenContext({
  id,
  files,
  patientReference,
  openMode,
  includeLegacyNiftiIdentifiers = false,
}) {
  const studyId = String(id || '').trim() || 'study';
  const normalizedFiles = (Array.isArray(files) ? files : [])
    .map((entry) => normalizeFileEntry(entry))
    .filter((entry) => entry !== null);

  const identifiers = [
    { system: CAST_OPEN_MODE, value: openMode },
    {
      system: CAST_IDENTIFIER_WORKLIST_SAMPLE_ID,
      value: studyId,
    },
    {
      system: CAST_IDENTIFIER_VOLVIEW_SAMPLE_ID,
      value: studyId,
    },
  ];

  if (includeLegacyNiftiIdentifiers && normalizedFiles.length === 1) {
    const [only] = normalizedFiles;
    identifiers.push({
      system: CAST_IDENTIFIER_NIFTI_URL,
      value: only.url,
    });
    if (only.fileName) {
      identifiers.push({
        system: CAST_IDENTIFIER_NIFTI_FILENAME,
        value: only.fileName,
      });
    }
  }

  const studyResource = {
    resourceType: 'ImagingStudy',
    id: studyId,
    meta: {
      profile: [CAST_IMAGING_STUDY_OPEN_PROFILE],
    },
    identifier: identifiers,
    status: 'available',
  };
  if (patientReference) {
    studyResource.subject = { reference: String(patientReference).trim() };
  }

  const context = [
    {
      key: 'study',
      resource: studyResource,
    },
  ];

  if (normalizedFiles.length > 0) {
    context.push({
      key: 'files',
      resource: {
        files: normalizedFiles.map((file) => ({
          url: file.url,
          fileName: file.fileName || undefined,
          mimeType: file.mimeType || undefined,
          role: file.role || undefined,
          label: file.label || undefined,
        })),
      },
    });
  }

  return context;
}

/**
 * @param {object} params
 * @param {string} params.id
 * @param {Array<{ url: string, fileName?: string, mimeType?: string, role?: string, label?: string }>} params.files
 * @param {string} [params.patientReference]
 * @param {boolean} [params.includeLegacyNiftiIdentifiers]
 * @returns {Array<object>}
 */
export function buildFilesImagingStudyOpenContext({
  id,
  files,
  patientReference,
  includeLegacyNiftiIdentifiers = true,
}) {
  return buildUrlFilesImagingStudyOpenContext({
    id,
    files,
    patientReference,
    openMode: CAST_OPEN_MODE_FILES,
    includeLegacyNiftiIdentifiers,
  });
}

/**
 * Remote DICOM file(s) to download for ImagingStudy-open (``open-mode`` = ``dicom-url``).
 * Use for ``.dcm`` or ``.zip`` archives of DICOM instances (not NIfTI / generic volumes).
 *
 * @param {object} params
 * @param {string} params.id
 * @param {Array<{ url: string, fileName?: string, mimeType?: string, role?: string, label?: string }>} params.files
 * @param {string} [params.patientReference]
 * @returns {Array<object>}
 */
export function buildDicomUrlImagingStudyOpenContext({
  id,
  files,
  patientReference,
}) {
  return buildUrlFilesImagingStudyOpenContext({
    id,
    files,
    patientReference,
    openMode: CAST_OPEN_MODE_DICOM_URL,
    includeLegacyNiftiIdentifiers: false,
  });
}

/**
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.studyInstanceUID
 * @param {string} [params.seriesInstanceUID]
 * @param {string} [params.dicomwebRoot]
 * @param {string} [params.patientReference]
 * @param {string} [params.ohifMode] OHIF mode route segment (e.g. `microscopy`, `usAnnotation`)
 * @param {Array<{ url: string, fileName?: string, mimeType?: string, role?: string, label?: string }>} [params.files] Optional direct bucket URLs for viewers without DICOMweb
 * @param {'aws' | 'gcs'} [params.sourceBucket]
 * @returns {Array<object>}
 */
export function buildDicomwebImagingStudyOpenContext({
  id,
  studyInstanceUID,
  seriesInstanceUID,
  dicomwebRoot,
  patientReference,
  ohifMode,
  files,
  sourceBucket,
}) {
  const studyId = String(id || '').trim() || 'study';
  const studyUid = normalizeUid(studyInstanceUID);
  const seriesUid = normalizeUid(seriesInstanceUID);
  const root = String(dicomwebRoot || '')
    .trim()
    .replace(/\/$/, '');

  const identifiers = [
    { system: CAST_OPEN_MODE, value: CAST_OPEN_MODE_DICOMWEB },
    { system: CAST_IDENTIFIER_DICOM_UID, value: studyUid },
    {
      system: CAST_IDENTIFIER_WORKLIST_SAMPLE_ID,
      value: studyId,
    },
  ];
  if (root) {
    identifiers.push({ system: CAST_DICOMWEB_ROOT, value: root });
  }
  const ohifModeValue = String(ohifMode || '').trim();
  if (ohifModeValue) {
    identifiers.push({
      system: CAST_IDENTIFIER_OHIF_MODE,
      value: ohifModeValue,
    });
  }

  const normalizedFiles = (Array.isArray(files) ? files : [])
    .map((entry) => normalizeFileEntry(entry))
    .filter((entry) => entry !== null);
  if (normalizedFiles.length > 0) {
    const bucket =
      String(sourceBucket || 'aws')
        .trim()
        .toLowerCase() === 'gcs'
        ? 'gcs'
        : 'aws';
    identifiers.push({
      system: CAST_IDENTIFIER_IDC_SOURCE_BUCKET,
      value: bucket,
    });
    if (seriesUid) {
      identifiers.push({ system: CAST_IDENTIFIER_IDC, value: seriesUid });
    }
  }

  const studyResource = {
    resourceType: 'ImagingStudy',
    id: studyId,
    uid: studyUid,
    meta: {
      profile: [CAST_IMAGING_STUDY_OPEN_PROFILE],
    },
    identifier: identifiers,
    status: 'available',
  };
  if (patientReference) {
    studyResource.subject = { reference: String(patientReference).trim() };
  }

  const context = [
    {
      key: 'study',
      resource: studyResource,
    },
  ];

  if (seriesUid) {
    context.push({
      key: 'series',
      resource: {
        resourceType: 'ImagingStudy',
        uid: seriesUid,
      },
    });
  }

  if (normalizedFiles.length > 0) {
    context.push({
      key: 'files',
      resource: {
        files: normalizedFiles.map((file) => ({
          url: file.url,
          fileName: file.fileName || undefined,
          mimeType: file.mimeType || undefined,
          role: file.role || undefined,
          label: file.label || undefined,
        })),
      },
    });
  }

  return context;
}

/**
 * Build FHIRcast ImagingStudy-open context for IDC direct bucket load.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.studyInstanceUID
 * @param {string} [params.seriesInstanceUID]
 * @param {'aws' | 'gcs'} [params.sourceBucket]
 * @param {Array<{ url: string, fileName?: string, mimeType?: string, role?: string, label?: string }>} params.files
 * @param {string} [params.patientReference]
 * @param {string} [params.ohifMode] OHIF mode route segment (e.g. `usAnnotation`)
 * @returns {Array<object>}
 */
export function buildIdcImagingStudyOpenContext({
  id,
  studyInstanceUID,
  seriesInstanceUID,
  sourceBucket,
  files,
  patientReference,
  ohifMode,
}) {
  const studyId = String(id || '').trim() || 'study';
  const studyUid = normalizeUid(studyInstanceUID);
  const seriesUid = normalizeUid(seriesInstanceUID);
  const bucket =
    String(sourceBucket || 'aws')
      .trim()
      .toLowerCase() === 'gcs'
      ? 'gcs'
      : 'aws';

  const normalizedFiles = (Array.isArray(files) ? files : [])
    .map((entry) => normalizeFileEntry(entry))
    .filter((entry) => entry !== null);

  const identifiers = [
    { system: CAST_OPEN_MODE, value: CAST_OPEN_MODE_IDC },
    { system: CAST_IDENTIFIER_DICOM_UID, value: studyUid },
    {
      system: CAST_IDENTIFIER_WORKLIST_SAMPLE_ID,
      value: studyId,
    },
    {
      system: CAST_IDENTIFIER_VOLVIEW_SAMPLE_ID,
      value: studyId,
    },
    { system: CAST_IDENTIFIER_IDC_SOURCE_BUCKET, value: bucket },
  ];
  if (seriesUid) {
    identifiers.push({ system: CAST_IDENTIFIER_IDC, value: seriesUid });
  }
  const ohifModeValue = String(ohifMode || '').trim();
  if (ohifModeValue) {
    identifiers.push({
      system: CAST_IDENTIFIER_OHIF_MODE,
      value: ohifModeValue,
    });
  }

  const studyResource = {
    resourceType: 'ImagingStudy',
    id: studyId,
    uid: studyUid,
    meta: {
      profile: [CAST_IMAGING_STUDY_OPEN_PROFILE],
    },
    identifier: identifiers,
    status: 'available',
  };
  if (patientReference) {
    studyResource.subject = { reference: String(patientReference).trim() };
  }

  const context = [
    {
      key: 'study',
      resource: studyResource,
    },
  ];

  if (seriesUid) {
    context.push({
      key: 'series',
      resource: {
        resourceType: 'ImagingStudy',
        uid: seriesUid,
      },
    });
  }

  if (normalizedFiles.length > 0) {
    context.push({
      key: 'files',
      resource: {
        files: normalizedFiles.map((file) => ({
          url: file.url,
          fileName: file.fileName || undefined,
          mimeType: file.mimeType || undefined,
          role: file.role || undefined,
          label: file.label || undefined,
        })),
      },
    });
  }

  return context;
}

/**
 * Build FHIRcast ImagingStudy-open context for remote volume file(s).
 *
 * @param {object} params
 * @param {string} params.id Study / sample id
 * @param {string} params.url Download URL
 * @param {string} [params.filename] Original filename hint
 * @param {string} [params.patientReference] e.g. Patient/503824b8-...
 * @returns {Array<object>}
 */
export function buildNiftiUrlImagingStudyOpenContext({
  id,
  url,
  filename,
  patientReference,
}) {
  return buildFilesImagingStudyOpenContext({
    id,
    files: [{ url, fileName: filename }],
    patientReference,
    includeLegacyNiftiIdentifiers: true,
  });
}
