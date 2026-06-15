export const CAST_STANDARD_V3_COMING = 'cast-v3-coming';
export const CAST_STANDARD_CAST = 'cast';
export const CAST_STANDARD_DEFAULT = CAST_STANDARD_CAST;

export const CAST_V3_COMING_SOON_MESSAGE =
  'Cast Interface v3.0 is coming this fall to this client library !';

export const CAST_STANDARD_TITLE = {
  [CAST_STANDARD_CAST]: 'Imaging Worklist',
  [CAST_STANDARD_V3_COMING]: 'Worklist with Cast interface',
};

export function isCastV3ComingStandard(standard) {
  return standard === CAST_STANDARD_V3_COMING;
}

export function titleMainForCastStandard(standard) {
  return (
    CAST_STANDARD_TITLE[standard] || CAST_STANDARD_TITLE[CAST_STANDARD_CAST]
  );
}
