import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const random = createRandom(130417);
const games = [];

for (let index = 0; index < 12; index += 1) {
  const chess = new Chess();
  const event = `Synthetic Training Fixture ${String(index + 1).padStart(2, "0")}`;
  const site = `fixture:${String(index + 1).padStart(3, "0")}`;
  chess.header("Event", event, "Site", site, "Round", String(index + 1));

  if (index !== 11) {
    const whiteElo = [900, 1700, 450, 1200, 1000, 1800][index % 6];
    const blackElo = [1000, 950, 1750, 1650, 500, 1200][index % 6];
    chess.header("WhiteElo", String(whiteElo), "BlackElo", String(blackElo));
  }

  const targetPlies = 20 + Math.floor(random() * 21);
  for (let ply = 0; ply < targetPlies && !chess.isGameOver(); ply += 1) {
    const moves = chess.moves();
    chess.move(moves[Math.floor(random() * moves.length)]);
  }

  games.push(chess.pgn({ maxWidth: 0 }));
}

const outputPath = fileURLToPath(new URL("./games.pgn", import.meta.url));
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${games.join("\n\n")}\n`, "utf8");
