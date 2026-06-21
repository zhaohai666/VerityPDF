/** OpenCV.js 全局类型声明 */
declare const cv: {
  Mat: any;
  imread: (source: HTMLCanvasElement | HTMLImageElement | string) => any;
  imshow: (canvas: HTMLCanvasElement | string, mat: any) => void;
  fastNlMeansDenoisingColored: (src: any, dst: any, h: number, hColor: number, templateWindowSize: number, searchWindowSize: number) => void;
  cvtColor: (src: any, dst: any, code: number) => void;
  Canny: (src: any, dst: any, threshold1: number, threshold2: number) => void;
  HoughLinesP: (src: any, lines: any, rho: number, theta: number, threshold: number, minLineLength: number, maxLineGap: number) => void;
  getRotationMatrix2D: (center: any, angle: number, scale: number) => any;
  warpAffine: (src: any, dst: any, M: any, dsize: any) => void;
  createCLAHE: (clipLimit: number, tileGridSize: any) => any;
  threshold: (src: any, dst: any, thresh: number, maxval: number, type: number) => number;
  filter2D: (src: any, dst: any, ddepth: number, kernel: any) => void;
  MatFromArray: (rows: number, cols: number, type: number, array: number[]) => any;
  Size: new (width: number, height: number) => any;
  Point: new (x: number, y: number) => any;

  // 常量
  COLOR_RGBA2GRAY: number;
  COLOR_GRAY2RGBA: number;
  COLOR_RGBA2RGB: number;
  COLOR_RGB2GRAY: number;
  THRESH_BINARY: number;
  THRESH_OTSU: number;
  CV_8UC1: number;
  CV_8UC3: number;
  CV_8UC4: number;
  CV_32F: number;
  BORDER_CONSTANT: number;
  BORDER_REPLICATE: number;
};

interface Window {
  __opencvReady?: boolean;
}
