import type { PieceRenderObject } from "react-chessboard";
import bB from "../../../design/assets/pieces/horsey/bB.svg";
import bK from "../../../design/assets/pieces/horsey/bK.svg";
import bN from "../../../design/assets/pieces/horsey/bN.svg";
import bP from "../../../design/assets/pieces/horsey/bP.svg";
import bQ from "../../../design/assets/pieces/horsey/bQ.svg";
import bR from "../../../design/assets/pieces/horsey/bR.svg";
import wB from "../../../design/assets/pieces/horsey/wB.svg";
import wK from "../../../design/assets/pieces/horsey/wK.svg";
import wN from "../../../design/assets/pieces/horsey/wN.svg";
import wP from "../../../design/assets/pieces/horsey/wP.svg";
import wQ from "../../../design/assets/pieces/horsey/wQ.svg";
import wR from "../../../design/assets/pieces/horsey/wR.svg";

const assetUrls: Record<string, string> = {
  bB,
  bK,
  bN,
  bP,
  bQ,
  bR,
  wB,
  wK,
  wN,
  wP,
  wQ,
  wR,
};

export const horseyPieces: PieceRenderObject = Object.fromEntries(
  Object.entries(assetUrls).map(([code, src]) => [
    code,
    () => (
      <img
        src={src}
        draggable={false}
        alt=""
        style={{ objectFit: "contain", pointerEvents: "none" }}
      />
    ),
  ]),
);
