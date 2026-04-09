// Bundle size management - start
import './DataAccessHelper/HtmlDataAccessHelper';
import './DataAccessHelper/HttpDataAccessHelper';
import './DataAccessHelper/JSZipDataAccessHelper';
// Bundle size management - end

import BinaryHelper from './BinaryHelper';
import vtkCastClient from './CastClient';
import DataAccessHelper from './DataAccessHelper';
import vtkHttpDataSetReader from './HttpDataSetReader';
import vtkHttpSceneLoader from './HttpSceneLoader';
import vtkImageStream from './ImageStream';
import vtkResourceLoader from './ResourceLoader';
import vtkWSLinkClient from './WSLinkClient';

export default {
  BinaryHelper,
  vtkCastClient,
  DataAccessHelper,
  vtkHttpDataSetReader,
  vtkHttpSceneLoader,
  vtkImageStream,
  vtkResourceLoader,
  vtkWSLinkClient,
};
