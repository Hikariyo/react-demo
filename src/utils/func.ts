export interface Point {
  x: number;
  y: number;
}

export interface LinearFunction {
  k: number;
  b: number;
  func: (x: number) => number;
  reverseFunc: (y: number) => number;
  A: Point;
  B: Point;
}

export function pointToLinearDistance(point: Point, linear: LinearFunction) {
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

export function linearsIntersection(linear1: LinearFunction, linear2: LinearFunction): Point {
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

export function getRotatedPoint(origin: Point, point: Point, angle: number): Point {
  return {
    x: (point.x - origin.x) * Math.cos((angle * Math.PI) / 180) - (point.y - origin.y) * Math.sin((angle * Math.PI) / 180) + origin.x,
    y: (point.x - origin.x) * Math.sin((angle * Math.PI) / 180) + (point.y - origin.y) * Math.cos((angle * Math.PI) / 180) + origin.y,
  };
}

export function linearFunction(pointA: Point, pointB: Point): LinearFunction {
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

export function linearFunctionMove(linear: LinearFunction, offset: number) {
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

export function symmetricalPoint(point: Point, linear: LinearFunction) {
  if (linear.k === 0) {
    return {
      x: point.x,
      y: 2 * linear.b - point.y,
    };
  } else if (!Number.isFinite(linear.k)) {
    return {
      x: 2 * linear.reverseFunc(0) - point.x,
      y: point.y,
    };
  } else {
    return {
      x: ((1 - linear.k ** 2) * point.x + 2 * linear.k * point.y - 2 * linear.k * linear.b) / (linear.k ** 2 + 1),
      y: (2 * linear.k * point.x + (linear.k ** 2 - 1) * point.y + 2 * linear.b) / (linear.k ** 2 + 1),
    };
  }
}