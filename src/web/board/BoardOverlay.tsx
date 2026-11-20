import type { BoardArrow } from "../coach/annotations.js";
import { arrowShape, type BoardOrientation } from "./overlayGeometry.js";

export function BoardOverlay({
  arrows,
  orientation,
}: {
  arrows: BoardArrow[];
  orientation: BoardOrientation;
}) {
  return (
    <svg
      className="pp-board__arrows"
      viewBox="0 0 8 8"
      aria-hidden="true"
      focusable="false"
    >
      {arrows.map((arrow, index) => {
        const shape = arrowShape(arrow.from, arrow.to, orientation);
        const better = arrow.kind === "better";
        const color = better
          ? "var(--pp-arrow-better)"
          : "var(--pp-arrow-threat)";
        return (
          <g
            data-arrow-kind={arrow.kind}
            data-arrow-from={arrow.from}
            data-arrow-to={arrow.to}
            key={`${arrow.kind}-${index}`}
          >
            <line
              x1={shape.shaftStart[0]}
              y1={shape.shaftStart[1]}
              x2={shape.shaftEnd[0]}
              y2={shape.shaftEnd[1]}
              stroke="var(--pp-arrow-halo)"
              strokeWidth="0.3"
              strokeLinecap="round"
            />
            <polygon
              points={shape.headPoints}
              fill="var(--pp-arrow-halo)"
              stroke="var(--pp-arrow-halo)"
              strokeWidth="0.1"
              strokeLinejoin="round"
            />
            <line
              x1={shape.shaftStart[0]}
              y1={shape.shaftStart[1]}
              x2={shape.colorShaftEnd[0]}
              y2={shape.colorShaftEnd[1]}
              stroke={color}
              strokeWidth="0.18"
              strokeDasharray={better ? undefined : "0.17 0.13"}
            />
            <polygon
              points={shape.headPoints}
              fill={color}
              stroke={color}
              strokeWidth="0.02"
              strokeLinejoin="round"
            />
          </g>
        );
      })}
    </svg>
  );
}
