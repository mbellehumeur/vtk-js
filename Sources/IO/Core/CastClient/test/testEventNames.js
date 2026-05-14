import test from 'tape';

import {
  dataTypeFromEventName,
  isRequestEvent,
  isResponseEvent,
  normalizeDataType,
  requestEventFor,
  responseEventFor,
} from 'vtk.js/Sources/IO/Core/CastClient/eventNames';

test('CastClient eventNames - requestEventFor lowercases dataType', (t) => {
  t.equal(requestEventFor('PNGFULLSIZE'), 'pngfullsize-request');
  t.equal(requestEventFor('JpgThumbnail'), 'jpgthumbnail-request');
  t.equal(requestEventFor('  DICOM  '), 'dicom-request');
  t.equal(requestEventFor('FHIRcastContext'), 'fhircastcontext-request');
  t.equal(requestEventFor(''), '');
  t.equal(requestEventFor(null), '');
  t.end();
});

test('CastClient eventNames - responseEventFor matches request base', (t) => {
  t.equal(responseEventFor('PNGFULLSIZE'), 'pngfullsize-response');
  t.equal(responseEventFor('SCENEVIEW'), 'sceneview-response');
  t.equal(responseEventFor('   '), '');
  t.end();
});

test('CastClient eventNames - isRequestEvent rejects legacy cast-request', (t) => {
  t.true(isRequestEvent('pngfullsize-request'));
  t.true(isRequestEvent('dicom-request'));
  t.false(isRequestEvent('cast-request'));
  t.false(isRequestEvent('pngfullsize-response'));
  t.false(isRequestEvent('imagingstudy-open'));
  t.false(isRequestEvent(''));
  t.false(isRequestEvent(null));
  t.end();
});

test('CastClient eventNames - isResponseEvent rejects legacy cast-response', (t) => {
  t.true(isResponseEvent('pngfullsize-response'));
  t.false(isResponseEvent('cast-response'));
  t.false(isResponseEvent('pngfullsize-request'));
  t.false(isResponseEvent(''));
  t.end();
});

test('CastClient eventNames - dataTypeFromEventName strips suffix', (t) => {
  t.equal(dataTypeFromEventName('pngfullsize-request'), 'pngfullsize');
  t.equal(dataTypeFromEventName('dicom-response'), 'dicom');
  t.equal(dataTypeFromEventName('cast-request'), '');
  t.equal(dataTypeFromEventName('cast-response'), '');
  t.equal(dataTypeFromEventName('imagingstudy-open'), '');
  t.equal(dataTypeFromEventName(''), '');
  t.end();
});

test('CastClient eventNames - normalizeDataType trims and lowercases', (t) => {
  t.equal(normalizeDataType('PNGFULLSIZE'), 'pngfullsize');
  t.equal(normalizeDataType('  Mixed  '), 'mixed');
  t.equal(normalizeDataType(''), '');
  t.equal(normalizeDataType(null), '');
  t.equal(normalizeDataType(undefined), '');
  t.end();
});
