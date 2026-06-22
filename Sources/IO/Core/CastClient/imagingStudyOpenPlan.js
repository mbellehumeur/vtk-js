import {
  CAST_OPEN_MODE_DICOMWEB,
  CAST_OPEN_MODE_DICOM_URL,
  CAST_OPEN_MODE_FILES,
  CAST_OPEN_MODE_IDC,
  extractDicomSeriesUid,
  extractDicomStudyUid,
  extractDicomwebRoot,
  extractIdcSeriesUid,
  extractIdcSourceBucket,
  extractImagingStudyFiles,
  extractNiftiDownloadUrl,
  extractNiftiFilename,
  extractOhifMode,
  extractOpenMode,
  extractVolviewSampleId,
} from './imagingStudyContext';

/**
 * FHIRcast ImagingStudy-open context is normally an array of { key, resource }.
 * Some hubs send a plain object; normalize so vtk extractors work.
 */
export function normalizeImagingStudyContext(context) {
  if (Array.isArray(context)) {
    return context;
  }
  if (!context || typeof context !== 'object') {
    return context;
  }

  const items = Object.entries(context).reduce((acc, [key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      acc.push({ key, resource: value });
    }
    return acc;
  }, []);

  return items.length ? items : context;
}

function resolveFilesPlan(context, studyId, ohifMode) {
  const normalized = normalizeImagingStudyContext(context);
  const files = extractImagingStudyFiles(normalized);
  if (files.length === 0) {
    return null;
  }
  return { mode: 'files', studyId, files, ohifMode };
}

export function resolveImagingStudyOpenPlan(context) {
  const normalized = normalizeImagingStudyContext(context);
  const studyId = extractVolviewSampleId(normalized) || 'study';
  const openMode = extractOpenMode(normalized);
  const ohifMode = extractOhifMode(normalized) || undefined;

  if (openMode === CAST_OPEN_MODE_DICOMWEB) {
    const studyInstanceUID = extractDicomStudyUid(normalized);
    if (!studyInstanceUID) {
      return null;
    }
    const plan = {
      mode: 'dicomweb',
      studyId,
      studyInstanceUID,
      seriesInstanceUID: extractDicomSeriesUid(normalized) || undefined,
      dicomwebRoot: extractDicomwebRoot(normalized) || undefined,
      ohifMode,
    };
    const files = extractImagingStudyFiles(normalized);
    if (files.length > 0) {
      plan.idcFallback = {
        studyInstanceUID,
        seriesInstanceUID:
          extractIdcSeriesUid(normalized) ||
          extractDicomSeriesUid(normalized) ||
          undefined,
        sourceBucket: extractIdcSourceBucket(normalized),
        files,
      };
    }
    return plan;
  }

  if (openMode === CAST_OPEN_MODE_FILES) {
    const filesPlan = resolveFilesPlan(normalized, studyId, ohifMode);
    if (filesPlan) {
      return filesPlan;
    }
  }

  if (openMode === CAST_OPEN_MODE_DICOM_URL) {
    const files = extractImagingStudyFiles(normalized);
    if (!files.length) {
      return null;
    }
    return { mode: 'dicom-url', studyId, files, ohifMode };
  }

  if (openMode === CAST_OPEN_MODE_IDC) {
    const studyInstanceUID = extractDicomStudyUid(normalized);
    if (!studyInstanceUID) {
      return null;
    }
    const files = extractImagingStudyFiles(normalized);
    if (!files.length) {
      return null;
    }
    return {
      mode: 'idc',
      studyId,
      studyInstanceUID,
      seriesInstanceUID:
        extractIdcSeriesUid(normalized) ||
        extractDicomSeriesUid(normalized) ||
        undefined,
      sourceBucket: extractIdcSourceBucket(normalized),
      files,
      ohifMode,
    };
  }

  const legacyFiles = resolveFilesPlan(normalized, studyId, ohifMode);
  if (legacyFiles) {
    return legacyFiles;
  }

  const url = extractNiftiDownloadUrl(normalized);
  if (url) {
    const filename = extractNiftiFilename(normalized);
    return {
      mode: 'files',
      studyId,
      files: [{ url, fileName: filename || 'volume.nii.gz', label: studyId }],
      ohifMode,
    };
  }

  const studyInstanceUID = extractDicomStudyUid(normalized);
  if (studyInstanceUID) {
    return {
      mode: 'dicomweb',
      studyId,
      studyInstanceUID,
      seriesInstanceUID: extractDicomSeriesUid(normalized) || undefined,
      dicomwebRoot: extractDicomwebRoot(normalized) || undefined,
      ohifMode,
    };
  }

  return null;
}

export function normalizeStudyUID(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().replace(/^urn:oid:/i, '');
}

export function extractStudyUIDFromResource(resource) {
  if (!resource || typeof resource !== 'object') {
    return '';
  }

  const fromUid = normalizeStudyUID(resource.uid);
  if (fromUid) {
    return fromUid;
  }

  const identifiers = Array.isArray(resource.identifier)
    ? resource.identifier
    : [];
  const dicomUidIdentifier = identifiers.find(
    (identifier) =>
      typeof identifier?.system === 'string' &&
      identifier.system.toLowerCase() === 'urn:dicom:uid'
  );
  return normalizeStudyUID(dicomUidIdentifier?.value);
}
