export type BoardOrientation = "white" | "black";
export type Point = [number, number];

export type ArrowGeometry = {
  shaftStart: Point;
  shaftEnd: Point;
  colorShaftEnd: Point;
  tip: Point;
  headBase: Point;
  headLeft: Point;
  headRight: Point;
  headPoints: string;
};

const FILES = "abcdefgh";

export function squareCenter(
  square: string,
  orientation: BoardOrientation,
): Point {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  if (file < 0 || rank < 1 || rank > 8) {
    throw new Error(`Invalid chess square: ${square}`);
  }
  const whiteX = file + 0.5;
  const whiteY = 8 - rank + 0.5;
  return orientation === "white" ? [whiteX, whiteY] : [8 - whiteX, 8 - whiteY];
}

export function arrowShape(
  from: string,
  to: string,
  orientation: BoardOrientation,
): ArrowGeometry {
  const [x1, y1] = squareCenter(from, orientation);
  const [x2, y2] = squareCenter(to, orientation);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length === 0) throw new Error("An arrow must point to another square");

  const ux = dx / length;
  const uy = dy / length;
  const tip: Point = [x2 - ux * 0.08, y2 - uy * 0.08];
  const headBase: Point = [tip[0] - ux * 0.4, tip[1] - uy * 0.4];
  const nx = -uy * 0.28;
  const ny = ux * 0.28;
  const headLeft: Point = [headBase[0] + nx, headBase[1] + ny];
  const headRight: Point = [headBase[0] - nx, headBase[1] - ny];
  const shaftStart: Point = [x1 + ux * 0.12, y1 + uy * 0.12];
  const colorShaftEnd: Point = [
    headBase[0] + ux * 0.02,
    headBase[1] + uy * 0.02,
  ];

  return {
    shaftStart,
    shaftEnd: headBase,
    colorShaftEnd,
    tip,
    headBase,
    headLeft,
    headRight,
    headPoints: [tip, headLeft, headRight]
      .map(([x, y]) => `${x},${y}`)
      .join(" "),
  };
}
