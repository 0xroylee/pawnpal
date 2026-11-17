import { describe, expect, it } from "vitest";
import { mirrorFen, mirrorSan, mirrorUci } from "./mirror.js";

describe("coach fixture mirroring", () => {
  it("flips board ranks, piece colors, side to move, castling rights and en passant", () => {
    expect(
      mirrorFen("r3k2r/ppp2ppp/8/3p4/4P3/8/PPP2PPP/R3K2R w KQkq e6 4 12"),
    ).toBe("r3k2r/ppp2ppp/8/4p3/3P4/8/PPP2PPP/R3K2R b KQkq e3 4 12");
    expect(mirrorFen("4k3/8/8/8/8/8/8/4K3 w Kq - 0 1")).toBe(
      "4k3/8/8/8/8/8/8/4K3 b Qk - 0 1",
    );
  });

  it("mirrors UCI coordinates and keeps promotion choices", () => {
    expect(mirrorUci("e2e4")).toBe("e7e5");
    expect(mirrorUci("a7a8q")).toBe("a2a1q");
    expect(mirrorUci("e1g1")).toBe("e8g8");
  });

  it("recomputes SAN on the mirrored position", () => {
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(mirrorSan(startFen, "e4")).toBe("e5");
  });
});
