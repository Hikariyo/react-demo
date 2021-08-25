import { fabric } from 'fabric';

const CONTROLS = ['bl', 'br', 'mb', 'ml', 'mr', 'mt', 'tl', 'tr', 'mtr'] as const;
type ControlType = typeof CONTROLS[number];

interface Point extends Pick<fabric.Point, 'x' | 'y'> {}

interface LinearFunctionDefault {
  k: number;
  b: number;
  func: (x: number) => number;
  reverseFunc: (y: number) => number;
}

interface LinearFunction {
  k: number;
  b: number;
  func: (x: number) => number;
  reverseFunc: (y: number) => number;
  A: Point;
  B: Point;
}

type ActionHandler = (eventData: MouseEvent, transform: fabric.Transform, x: number, y: number) => boolean;

type WrapWithFireEvent = (eventName: string, actionHandler: ActionHandler) => ActionHandler;
type WrapWithFixedAnchor = (actionHandler: ActionHandler) => ActionHandler;

const scaleCursorStyleHandler = (fabric as any).controlsUtils.scaleCursorStyleHandler;
const scalingX = (fabric as any).controlsUtils.scalingX;

function wrapWithFixedAnchor(actionHandler: ActionHandler) {
  return function (e: MouseEvent, transform: fabric.Transform, x: number, y: number) {
    const target = transform.target;
    const centerPoint = target.getCenterPoint();
    const constraint = target.translateToOriginPoint(centerPoint, transform.originX, transform.originY);
    const actionPerformed = actionHandler(e, transform, x, y);
    target.setPositionByOrigin(constraint, transform.originX, transform.originY);
    return actionPerformed;
  };
}

function wrapWithFireEvent(eventName: string, actionHandler: ActionHandler) {
  return function (e: MouseEvent, transform: fabric.Transform, x: number, y: number) {
    let actionPerformed = actionHandler(e, transform, x, y);
    if (actionPerformed) {
      fireEvent(eventName, commonEventInfo(e, transform, x, y));
    }
    return actionPerformed;
  };
}

function fireEvent(eventName: string, options: { e: MouseEvent; transform: fabric.Transform; pointer: { x: number; y: number } }) {
  const target = options.transform.target;
  const canvas = target.canvas;
  const canvasOptions = fabric.util.object.clone(options);
  canvasOptions.target = target;
  canvas && canvas.fire('object:' + eventName, canvasOptions);
  target.fire(eventName, options);
}

function commonEventInfo(e: MouseEvent, transform: fabric.Transform, x: number, y: number) {
  return {
    e,
    transform,
    pointer: {
      x: x,
      y: y,
    },
  };
}

function getLocalPoint(transform: fabric.Transform, originX: string, originY: string, x: number, y: number) {
  const target = transform.target;
  const control = target.controls[transform.corner];
  const zoom = target.canvas?.getZoom() || 1;
  const padding = (target.padding || 0) / zoom;
  const localPoint = target.toLocalPoint(new fabric.Point(x, y), originX, originY);
  if (localPoint.x >= padding) {
    localPoint.x -= padding;
  }
  if (localPoint.x <= -padding) {
    localPoint.x += padding;
  }
  if (localPoint.y >= padding) {
    localPoint.y -= padding;
  }
  if (localPoint.y <= padding) {
    localPoint.y += padding;
  }
  localPoint.x -= control.offsetX;
  localPoint.y -= control.offsetY;
  return localPoint;
}

interface EventTransform {
  corner: ControlType;
  original: fabric.Object;
  originX: string;
  originY: string;
  width: number;
}

type ACoords = Record<'tl' | 'tr' | 'br' | 'bl', fabric.Point>;

function cropX(container: fabric.Object, options: { by?: 'left' | 'right' }) {
  return function (e: MouseEvent, transform: fabric.Transform, _x: number, _y: number) {
    const point = getLocalPoint(transform, transform.originX, transform.originY, _x, _y);
    const klass = transform.target;
    const scaleWidth = container.getScaledWidth();
    const { tl, bl, tr } = klass.aCoords as ACoords;
    const { tl: TL, bl: BL } = container.aCoords as ACoords;
    const { angle = 0, width = 0 } = klass;
    let x = options.by === 'left' ? -point.x : point.x;

    (klass as any).pad = { left: 0, top: 0, right: 0, bottom: 0, ...(klass as any).pad };

    let distance = 0;
    const ang = (angle < 0 ? 360 : 0) + (angle % 360);
    if (ang === 0) {
      distance = tl.x - TL.x;
    } else if (ang === 90) {
      distance = tl.y - TL.y;
    } else if (ang === 180) {
      distance = TL.x - tl.x;
    } else if (ang === 270) {
      distance = TL.y - tl.y;
    } else if (ang < 180) {
      distance = -pointToLinearDistance({ x: _x, y: _y }, getLinearFunction(TL, BL));
    } else {
      distance = pointToLinearDistance(tl, getLinearFunction(TL, BL));
    }

    if (distance < 0) {
      if (options.by === 'left') {
        (klass as any).pad.left = 0;
      } else {
        (klass as any).pad.right = 0;
      }
      klass.set('width', scaleWidth);
      return false;
    } else if (distance > scaleWidth) {
      klass.set('width', 0);
      return false;
    }

    if (options.by === 'left') {
      (klass as any).pad.left = distance;
    } else {
      (klass as any).pad.right = distance;
    }

    klass.set('width', x);
    return true;
  };
}

function cropY(container: fabric.Object, options: { by?: 'top' | 'bottom' }) {
  return function (e: MouseEvent, transform: fabric.Transform, _x: number, _y: number) {
    const point = getLocalPoint(transform, transform.originX, transform.originY, _x, _y);
    const klass = transform.target;
    const scaleHeight = container.getScaledHeight();

    let y = options.by === 'top' ? -point.y : point.y;

    if (y < 2) {
      klass.set('height', 2);
      return false;
    }
    if (y > scaleHeight) {
      klass.set('height', scaleHeight);
      return false;
    }
    klass.set('height', y);
    return true;
  };
}

export default class Tabric {
  private _canvas;
  lastTop = 0;
  lastLeft = 0;
  constructor(el: string) {
    this._canvas = new fabric.Canvas(el, {
      width: 1200,
      height: 600,
    });
    this._canvas.preserveObjectStacking = true;
  }

  addImage(url: string) {
    return fabric.Image.fromURL(url, (image) => {
      image.set({
        width: 400,
        height: 400,
        left: 400,
        top: 100,
      });
      image.rotate(30);
      this._canvas.add(image);
    });
  }

  cropTarget: fabric.Image | null = null;
  cropIndex: number = -1;
  cropBackups: fabric.Image | null = null;
  cropStatic: fabric.Image | null = null;
  cropStaticBackups: fabric.Image | null = null;

  startCrop = () => {
    if (this.cropStatic && this.cropBackups && this.cropTarget) {
      return;
    }

    const activeObj = this._canvas.getActiveObject();

    if (!activeObj || activeObj.type !== 'image') {
      return;
    }
    this.cropIndex = this._canvas.getObjects().findIndex((klass) => klass === activeObj);

    // 移动对象
    this.cropStatic = fabric.util.object.clone(((activeObj as any).cropStatic as fabric.Image) || activeObj) as fabric.Image;
    // 备份对象
    this.cropBackups = fabric.Image = fabric.util.object.clone(activeObj);
    // 裁剪对象
    this.cropTarget = activeObj as fabric.Image;
    // 移动对象备份
    this.cropStaticBackups = (activeObj as any).cropStatic;

    this.cropStatic
      .setControlsVisibility({
        mtr: false,
        ml: false,
        mt: false,
        mr: false,
        mb: false,
      })
      .set({
        lockSkewingX: true,
        lockSkewingY: true,
        lockScalingFlip: true,
        opacity: 0.6,
      });

    this.cropTarget
      .setControlsVisibility({
        mtr: false,
        ml: true,
        mt: true,
        mr: true,
        mb: true,
      })
      .set({
        lockMovementX: true,
        lockMovementY: true,
        lockSkewingX: true,
        lockSkewingY: true,
        lockScalingFlip: true,
      });
    (this.cropTarget as any).cropping = true;
    let scaleWidth = Infinity;
    let scaleHeight = Infinity;

    let linear: {
      left: LinearFunction;
      top: LinearFunction;
      right: LinearFunction;
      bottom: LinearFunction;
    } = {} as any;
    let coords: {
      tl: Point;
      tr: Point;
      br: Point;
      bl: Point;
    } = {} as any;

    let minScaleX = 0;
    let minScaleY = 0;
    let lastScaleX = 1;
    let lastScaleY = 1;

    let maxScaleX = 1;
    let maxScaleY = 1;

    if (!(this.cropTarget as any).cropStatic) {
      this.cropTarget.on('mousedown', (e: fabric.IEvent) => {
        if (!this.cropTarget || !this.cropStatic) {
          return;
        }
        const { width = 0, height = 0, scaleX = 1, scaleY = 1 } = this.cropTarget;
        const { scaleX: imageScaleX = 1, scaleY: imageScaleY = 1, width: WIDTH = 0 } = this.cropStatic;
        const { tl, tr, br, bl } = this.cropTarget.get('aCoords') as ACoords;
        const { tl: TL, tr: TR, br: BR, bl: BL } = this.cropStatic.get('aCoords') as ACoords;
        const leftLinear = getLinearFunction(tl, bl);
        const topLinear = getLinearFunction(tl, tr);
        const rightLinear = getLinearFunction(tr, br);
        const bottomLinear = getLinearFunction(br, bl);

        const leftDistance = Math.abs(pointToLinearDistance(TL, leftLinear));
        const topDistance = Math.abs(pointToLinearDistance(TL, topLinear));
        const rightDistance = Math.abs(pointToLinearDistance(TR, rightLinear));
        const bottomDistance = Math.abs(pointToLinearDistance(BR, bottomLinear));

        switch (e.transform?.corner) {
          case 'ml':
            scaleWidth = width * imageScaleX + leftDistance;
            break;
          case 'mr':
            scaleWidth = width * imageScaleX + rightDistance;
            break;
          case 'mt':
            scaleHeight = height * imageScaleY + topDistance;
            break;
          case 'mb':
            scaleHeight = height * imageScaleY + bottomDistance;
            break;
          case 'tl':
            scaleWidth = width * imageScaleX + leftDistance;
            scaleHeight = height * imageScaleY + topDistance;
            break;
          case 'tr':
            scaleWidth = width * imageScaleX + rightDistance;
            scaleHeight = height * imageScaleY + topDistance;
            break;
          case 'br':
            scaleWidth = width * imageScaleX + rightDistance;
            scaleHeight = height * imageScaleY + bottomDistance;
            break;
          case 'bl':
            scaleWidth = width * imageScaleX + leftDistance;
            scaleHeight = height * imageScaleY + bottomDistance;
            break;
        }
      });
      this.cropTarget.on('scaling', () => {
        if (!this.cropTarget || !this.cropStatic) {
          return;
        }

        const { width = 0, height = 0, scaleX = 1, scaleY = 1 } = this.cropTarget;

        this.cropTarget.set({
          scaleX: Math.min(scaleX, scaleWidth / width),
          scaleY: Math.min(scaleY, scaleHeight / height),
        });
      });
      const calculateCrop = () => {
        if (!this.cropTarget || !this.cropStatic) {
          return;
        }

        const { width = 0, height = 0, scaleX = 1, scaleY = 1 } = this.cropTarget;
        const { scaleX: imageScaleX = 1, scaleY: imageScaleY = 1 } = this.cropStatic;

        const { tl: TL } = this.cropStatic.aCoords as ACoords;
        const point = this.cropTarget.toLocalPoint(new fabric.Point(TL.x, TL.y), 'left', 'top');

        this.cropTarget.set({
          width: (width * scaleX) / imageScaleX,
          height: (height * scaleY) / imageScaleY,
          cropX: Math.abs(point.x) / imageScaleX,
          cropY: Math.abs(point.y) / imageScaleY,
          scaleX: imageScaleX,
          scaleY: imageScaleY,
          opacity: 1,
        });
      };
      this.cropTarget.on('scaled', calculateCrop);

      this.cropStatic.on('mousedown', (e: fabric.IEvent) => {
        if (!this.cropTarget || !this.cropStatic) {
          return;
        }
        const { angle = 0 } = this.cropTarget;
        const { tl, tr, br, bl } = this.cropTarget.get('aCoords') as ACoords;
        const { tl: TL, tr: TR, br: BR, bl: BL } = this.cropStatic.get('aCoords') as ACoords;
        const leftLinear = getLinearFunction(bl, tl);
        const topLinear = getLinearFunction(tl, tr);
        const rightLinear = getLinearFunction(tr, br);
        const bottomLinear = getLinearFunction(br, bl);

        const leftLINEAR = getLinearFunction(BL, TL);
        const topLINEAR = getLinearFunction(TL, TR);
        const rightLINEAR = getLinearFunction(TR, BR);
        const bottomLINEAR = getLinearFunction(BR, BL);

        // scaling
        if (e.transform?.corner) {
          const { width = 0, height = 0 } = this.cropStatic;
          switch (e.transform?.corner) {
            case 'ml':
              minScaleX = Math.abs(pointToLinearDistance(tl, rightLINEAR)) / width;
              break;
            case 'mr':
              minScaleX = Math.abs(pointToLinearDistance(tr, leftLINEAR)) / width;
              break;
            case 'mt':
              minScaleY = Math.abs(pointToLinearDistance(tl, bottomLINEAR)) / height;
              break;
            case 'mb':
              minScaleY = Math.abs(pointToLinearDistance(bl, topLINEAR)) / height;
              break;
            case 'tl':
              minScaleX = Math.abs(pointToLinearDistance(tl, rightLINEAR)) / width;
              minScaleY = Math.abs(pointToLinearDistance(tl, bottomLINEAR)) / height;
              break;
            case 'tr':
              minScaleX = Math.abs(pointToLinearDistance(tr, leftLINEAR)) / width;
              minScaleY = Math.abs(pointToLinearDistance(tl, bottomLINEAR)) / height;
              break;
            case 'br':
              minScaleX = Math.abs(pointToLinearDistance(tr, leftLINEAR)) / width;
              minScaleY = Math.abs(pointToLinearDistance(bl, topLINEAR)) / height;
              break;
            case 'bl':
              minScaleX = Math.abs(pointToLinearDistance(tl, rightLINEAR)) / width;
              minScaleY = Math.abs(pointToLinearDistance(bl, topLINEAR)) / height;
              break;
          }
          return;
        }
        // moving

        const vLinear = linearFunctionMove(leftLINEAR, Number.isFinite(leftLINEAR.k) ? rightLinear.b - rightLINEAR.b : br.x - BR.x);
        const hLinear = linearFunctionMove(topLINEAR, Number.isFinite(topLINEAR.k) ? bottomLinear.b - bottomLINEAR.b : br.x - BR.x);
        const cAngle = (angle % 360) + (angle < 0 ? 360 : 0);
        if (cAngle < 90) {
          linear = {
            left: vLinear as any,
            top: hLinear as any,
            right: leftLinear,
            bottom: topLinear,
          };
        } else if (cAngle < 180) {
          linear = {
            left: topLinear,
            top: vLinear as any,
            right: hLinear as any,
            bottom: leftLinear,
          };
        } else if (cAngle < 270) {
          linear = {
            left: leftLinear,
            top: topLinear,
            right: vLinear as any,
            bottom: hLinear as any,
          };
        } else {
          linear = {
            left: hLinear as any,
            top: leftLinear,
            right: topLinear,
            bottom: vLinear as any,
          };
        }
        coords = {
          tl: linearsIntersection(linear.top, linear.left),
          tr: linearsIntersection(linear.top, linear.right),
          br: linearsIntersection(linear.bottom, linear.right),
          bl: linearsIntersection(linear.bottom, linear.left),
        };
      });
      this.cropStatic.on('scaling', () => {
        if (!this.cropStatic) {
          return;
        }
        let scaleX = this.cropStatic.scaleX || 1;
        let scaleY = this.cropStatic.scaleY || 1;

        if (scaleX < minScaleX) {
          scaleX = minScaleX;
          scaleY = lastScaleY;
        } else {
          lastScaleY = scaleY;
        }

        if (scaleY < minScaleY) {
          scaleY = minScaleY;
          scaleX = lastScaleX;
        } else {
          lastScaleX = scaleX;
        }

        this.cropStatic.set({ scaleX, scaleY });
      });
      this.cropStatic.on('moving', (e) => {
        if (!this.cropStatic) {
          return;
        }
        const { left = 0, top = 0, angle = 0 } = this.cropStatic;
        const { tl: TL } = this.cropStatic.aCoords as ACoords;

        let l = left;
        let t = top;

        const minL = linear.left.reverseFunc(TL.y);
        const maxL = linear.right.reverseFunc(TL.y);
        const minT = linear.top.func(TL.x);
        const maxT = linear.bottom.func(TL.x);

        if (left < minL) {
          if (top < minT) {
            l = coords.tl.x;
            t = coords.tl.y;
          } else if (top > maxT) {
            l = coords.bl.x;
            t = coords.bl.y;
          } else {
            l = minL;
          }
        } else if (left > maxL) {
          if (top > maxT) {
            l = coords.br.x;
            t = coords.br.y;
          } else if (top < minT) {
            l = coords.tr.x;
            t = coords.tr.y;
          } else {
            l = maxL;
          }
        } else {
          if (top < minT) {
            t = minT;
          } else if (top > maxT) {
            t = maxT;
          }
        }

        this.cropStatic.set({ left: l, top: t });
      });
      this.cropStatic.on('moved', () => {
        if (!this.cropTarget) {
          return;
        }
        this.cropTarget.set('opacity', 1);
      });
      this.cropStatic.on('modified', calculateCrop);
    }

    this._canvas.add(this.cropStatic);
    this.cropTarget.bringToFront();
  };

  cancelCrop = () => {
    if (!this.cropStatic || !this.cropBackups || !this.cropTarget) {
      return;
    }
    (this.cropTarget as any).cropStatic = this.cropStaticBackups;
    (this.cropTarget as any).cropping = false;
    this.cropTarget.setControlVisible('mtr', true).set({
      lockMovementX: false,
      lockMovementY: false,
      lockSkewingX: false,
      lockSkewingY: false,
      lockScalingFlip: false,
    });
    this._canvas.remove(this.cropStatic, this.cropTarget).add(this.cropBackups);
    this.cropBackups.moveTo(this.cropIndex);
    this._canvas.setActiveObject(this.cropBackups);
    this.cropTarget = null;
    this.cropBackups = null;
    this.cropStatic = null;
  };

  crop = () => {
    if (!this.cropStatic || !this.cropBackups || !this.cropTarget) {
      return;
    }

    (this.cropTarget as any).cropStatic = this.cropStatic;
    (this.cropTarget as any).cropping = false;
    this._canvas.setActiveObject(this.cropTarget);
    this._canvas.remove(this.cropStatic);
    this.cropTarget.setControlVisible('mtr', true).set({
      lockMovementX: false,
      lockMovementY: false,
      lockSkewingX: false,
      lockSkewingY: false,
      lockScalingFlip: false,
    });
    // 计算移动和旋转偏移，首次裁剪绑定监听事件
    if (!(this.cropTarget as any)?.cropbound) {
      (this.cropTarget as any).cropbound = true;
      let startLeft = 0;
      let startTop = 0;
      let startAngle = 0;

      this.cropTarget.on('mousedown', function (this: fabric.Image) {
        startLeft = this.left || 0;
        startTop = this.top || 0;
        startAngle = this.angle || 0;
      });
      this.cropTarget.on('moved', function (this: fabric.Image) {
        const cropStatic = (this as any).cropStatic as fabric.Image;
        const { left = 0, top = 0 } = this;
        cropStatic.set({
          left: (cropStatic.left || 0) + (left - startLeft),
          top: (cropStatic.top || 0) + (top - startTop),
        });
      });
      this.cropTarget.on('rotated', function (this: fabric.Image) {
        const cropStatic = (this as any).cropStatic as fabric.Image;
        const centerPoint = this.getCenterPoint();
        const { left = 0, top = 0 } = cropStatic;
        const point = getRotatedPoint(centerPoint, { x: left, y: top }, (this.angle || 0) - startAngle);
        cropStatic.set({
          left: point.x,
          top: point.y,
          angle: this.angle,
        });
      });
      this.cropTarget.on('scaled', function (this: fabric.Image) {
        if ((this as any).cropping) {
          return;
        }
        const { tl } = this.aCoords as ACoords;
        const cropStatic = (this as any).cropStatic as fabric.Image;
        const { tl: TL } = cropStatic.aCoords as ACoords;
        const { scaleX = 1, scaleY = 1, cropX = 0, cropY = 0, angle = 0 } = this;

        const x1 = TL.x - Math.sin((angle * Math.PI) / 180) * cropY * scaleY;
        const y1 = TL.y + Math.cos((angle * Math.PI) / 180) * cropY * scaleY;
        const x2 = TL.x + Math.cos((angle * Math.PI) / 180) * cropX * scaleX;
        const y2 = TL.y + Math.sin((angle * Math.PI) / 180) * cropX * scaleX;
        const x3 = x1 + (x2 - TL.x);
        const y3 = y1 + (y2 - TL.y);
        cropStatic.set({
          left: tl.x - (x3 - TL.x),
          top: tl.y - (y3 - TL.y),
          scaleX,
          scaleY,
        });
      });
    }
    // 清空
    this.cropTarget = null;
    this.cropBackups = null;
    this.cropStatic = null;
  };
}

type Line = [Point, Point];

function getParallelLineDistance(lineA: Line, lineB: Line) {
  const a1 = lineA[0].y - lineA[1].y;
  const b1 = lineA[1].x - lineA[0].x;
  const c1 = lineA[0].x * lineA[1].y - lineA[1].x * lineA[0].y;
  const a2 = lineB[0].y - lineB[1].y;
  const b2 = lineB[1].x - lineB[0].x;
  const ratio = a1 ? a1 / a2 : b1 / b2;
  const c2 = (lineB[0].x * lineB[1].y - lineB[1].x * lineB[0].y) * ratio;
  return (c1 - c2) / Math.sqrt(a1 ** 2 + b1 ** 2);
}

function getHypotenuse(a: Point, b: Point) {
  return Math.sqrt(Math.pow(Math.abs(a.x - b.x), 2) + Math.pow(Math.abs(a.y - b.y), 2));
}

function getLinearFunction(A: Point, B: Point): LinearFunction {
  const k = (A.y - B.y) / (A.x - B.x);
  const b = A.y - k * A.x;
  let func;
  let reverseFunc;
  if (!Number.isFinite(k)) {
    func = function (x: number) {
      return Infinity;
    };
    reverseFunc = function (y: number) {
      return A.x;
    };
  } else if (k === 0) {
    func = function (x: number) {
      return A.y;
    };
    reverseFunc = function (y: number) {
      return Infinity;
    };
  } else {
    func = function (x: number) {
      return k * x + b;
    };
    reverseFunc = function (y: number) {
      return (y - b) / k;
    };
  }
  return {
    k,
    b,
    func,
    reverseFunc,
    A,
    B,
  };
}

function pointToLinearDistance(point: Point, linear: LinearFunction) {
  let distance = 0;
  if (linear.A.x === linear.B.x) {
    // linear 平行于 y 轴
    distance = Math.abs(linear.A.x - point.x);
  } else if (linear.A.y === linear.B.y) {
    // linear 平行于 x 轴
    distance = Math.abs(linear.A.y - point.y);
  } else {
    distance = Math.abs((linear.k * point.x - point.y + linear.b) / Math.sqrt(Math.pow(linear.k, 2) + 1));
  }
  // (x1-x3)*(y2-y3)-(y1-y3)*(x2-x3)
  const direction = Math.sign((linear.A.x - point.x) * (linear.B.y - point.y) - (linear.A.y - point.y) * (linear.B.x - point.x));
  return direction * distance;
}

function linearsIntersection(linear1: LinearFunction, linear2: LinearFunction) {
  if (linear1.k === linear2.k) {
    return { x: Infinity, y: Infinity };
  }
  if (!Number.isFinite(linear1.k)) {
    return { x: linear1.reverseFunc(0), y: linear2.func(0) };
  }
  if (!Number.isFinite(linear2.k)) {
    return { x: linear2.reverseFunc(0), y: linear1.func(0) };
  }
  const x = (linear2.b - linear1.b) / (linear1.k - linear2.k);
  return {
    x,
    y: linear1.func(x),
  };
}

function getAbsDistance(a: { x: number; y: number }, b: { x: number; y: number }, p: { x: number; y: number }) {
  const linear = getLinearFunction(a, b);
  return Math.abs(linear.k * p.x - p.y + linear.b) / Math.sqrt(Math.pow(linear.k, 2) + 1);
}

function getDistance(a: { x: number; y: number }, b: { x: number; y: number }, p: { x: number; y: number }) {
  const linear = getLinearFunction(a, b);
  return (linear.k * p.x - p.y + linear.b) / Math.sqrt(Math.pow(linear.k, 2) + 1);
}

function getLimitedNumber(num: number, min: number, max: number) {
  if (num < min) {
    return min;
  }
  if (num > max) {
    return max;
  }
  return num;
}

function getRotatedPoint(origin: Point, point: Point, angle: number) {
  return {
    x: (point.x - origin.x) * Math.cos((angle * Math.PI) / 180) - (point.y - origin.y) * Math.sin((angle * Math.PI) / 180) + origin.x,
    y: (point.x - origin.x) * Math.sin((angle * Math.PI) / 180) + (point.y - origin.y) * Math.cos((angle * Math.PI) / 180) + origin.y,
  };
}

function linearFunction(pointA: Point, pointB: Point): LinearFunction {
  const k = (pointA.y - pointB.y) / (pointA.x - pointB.x);
  const b = pointA.y - k * pointA.x;
  if (k === 0) {
    const sign = Math.sign(pointB.x - pointA.x) * Infinity;
    const y = pointA.y;
    return {
      k,
      b,
      reverseFunc: () => sign,
      func: () => y,
      A: pointA,
      B: pointB,
    };
  } else if (!Number.isFinite(k)) {
    const sign = Math.sign(pointB.y - pointA.y) * Infinity;
    const x = pointA.x;
    return {
      k,
      b,
      reverseFunc: () => x,
      func: () => sign,
      A: pointA,
      B: pointB,
    };
  } else {
    return {
      k,
      b,
      reverseFunc: (y: number) => (y - b) / k,
      func: (x: number) => k * x + b,
      A: pointA,
      B: pointB,
    };
  }
}

function linearFunctionMove(linear: LinearFunction, offset: number) {
  const k = linear.k;
  if (k === 0) {
    const y = linear.func(0) + offset;
    return {
      k,
      b: y,
      reverseFunc: linear.reverseFunc,
      func: () => y,
    };
  } else if (!Number.isFinite(k)) {
    const x = linear.reverseFunc(0) + offset;
    const b = linear.b;
    return {
      k,
      b,
      reverseFunc: () => x,
      func: linear.func,
    };
  } else {
    const b = linear.b + offset;
    return {
      k,
      b,
      reverseFunc: (y: number) => (y - b) / k,
      func: (x: number) => k * x + b,
    };
  }
}
