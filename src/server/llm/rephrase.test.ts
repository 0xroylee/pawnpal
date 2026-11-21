import { afterEach, describe, expect, it, vi } from "vitest";
import { createLlmClient } from "./client.ts";
import { mockOpenAi } from "./mockOpenAi.ts";
import { rephrase } from "./rephrase.ts";
import {
  finalizeFact,
  type CoachFact,
  type RephraseMode,
} from "../../shared/coach/types.ts";

const fact = finalizeFact({
  kind: "threat",
  subject: { type: "n", color: "w", square: "f3" },
  attacker: { type: "r", color: "b", square: "b8" },
  betterMover: { type: "n", color: "w", square: "f3" },
  targets: [{ type: "k", color: "b", square: "e8" }],
  betterMoveSan: "Nxe5",
  betterMoveUci: "f3e5",
  threatMoveSan: "Rxf3+",
  threatMoveUci: "b8f3",
});

function input(mode: RephraseMode = "explain", inputFact = fact) {
  return {
    fact: inputFact,
    mode,
    templateText: "Can you protect your knight?",
    kidColor: "w" as const,
    language: "en" as const,
  };
}

function mockClient(text: string) {
  const mock = mockOpenAi({ replies: [{ text }] });
  return createLlmClient({
    baseUrl: "http://mock.local/v1",
    fetch: mock.app.request.bind(mock.app),
  });
}

function castlingFact(
  betterMoveSan?: string,
  betterMoveUci?: string,
  betterMover?: CoachFact["betterMover"],
) {
  return finalizeFact({
    kind: "missed-capture",
    ...(betterMoveSan === undefined ? {} : { betterMoveSan }),
    ...(betterMoveUci === undefined ? {} : { betterMoveUci }),
    ...(betterMover === undefined ? {} : { betterMover }),
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("rephrase", () => {
  it.each(["O-O", "O-O-O", "O-O+", "O-O-O#"] as const)(
    "uses the template without calling the client for better move %s in nudge and hint modes",
    async (betterMoveSan) => {
      for (const mode of ["nudge", "hint"] as const) {
        const client = {
          chat: vi.fn().mockResolvedValue({ text: "Keep thinking.", raw: {} }),
        };
        const logged: string[] = [];

        const result = await rephrase({
          client,
          model: "mock-model",
          input: input(mode, castlingFact(betterMoveSan)),
          log: (reason) => logged.push(reason),
        });

        expect(result).toEqual({
          text: "Can you protect your knight?",
          source: "template",
          reason: "reveals-better-move",
        });
        expect(client.chat).not.toHaveBeenCalled();
        expect(logged).toEqual(["reveals-better-move"]);
      }
    },
  );

  it("uses the template for UCI-only castling with a king or no better mover", async () => {
    const castlingUcis = [
      { uci: "e1g1", betterMover: { type: "k", color: "w", square: "e1" } },
      { uci: "e1c1", betterMover: { type: "k", color: "w", square: "e1" } },
      { uci: "e8g8" },
      { uci: "e8c8" },
    ] as const;

    for (const { uci, betterMover } of castlingUcis) {
      for (const mode of ["nudge", "hint"] as const) {
        const client = {
          chat: vi.fn().mockResolvedValue({ text: "Keep thinking.", raw: {} }),
        };
        const result = await rephrase({
          client,
          model: "mock-model",
          input: input(mode, castlingFact(undefined, uci, betterMover)),
        });

        expect(result).toEqual({
          text: "Can you protect your knight?",
          source: "template",
          reason: "reveals-better-move",
        });
        expect(client.chat).not.toHaveBeenCalled();
      }
    }
  });

  it.each(["explain", "reveal", "praise"] as const)(
    "still calls the client for a better castling move in %s mode",
    async (mode) => {
      const client = {
        chat: vi.fn().mockResolvedValue({ text: "Keep thinking.", raw: {} }),
      };

      const result = await rephrase({
        client,
        model: "mock-model",
        input: input(mode, castlingFact("O-O")),
      });

      expect(result).toEqual({ text: "Keep thinking.", source: "llm" });
      expect(client.chat).toHaveBeenCalledTimes(1);
    },
  );

  it("calls the client for a non-king move from e1 to g1", async () => {
    const client = {
      chat: vi.fn().mockResolvedValue({ text: "Keep thinking.", raw: {} }),
    };
    const nonKingFact = castlingFact("R1g1", "e1g1", {
      type: "r",
      color: "w",
      square: "e1",
    });

    const result = await rephrase({
      client,
      model: "mock-model",
      input: input("nudge", nonKingFact),
    });

    expect(result).toEqual({ text: "Keep thinking.", source: "llm" });
    expect(client.chat).toHaveBeenCalledTimes(1);
  });

  it("returns validated model text after stripping thinking blocks", async () => {
    const result = await rephrase({
      client: mockClient(
        "<think>internal reasoning</think> Your knight can help.",
      ),
      model: "mock-model",
      input: input(),
    });

    expect(result).toEqual({ text: "Your knight can help.", source: "llm" });
  });

  it("still returns the template if the optional logger throws", async () => {
    const result = await rephrase({
      client: mockClient("Look at a1."),
      model: "mock-model",
      input: input(),
      log: () => {
        throw new Error("logger unavailable");
      },
    });

    expect(result).toEqual({
      text: "Can you protect your knight?",
      source: "template",
      reason: "unknown-square",
    });
  });

  it.each([
    { reason: "empty", text: "", mode: "explain" },
    { reason: "meta-opening", text: "Sure, I can help.", mode: "explain" },
    { reason: "url", text: "Visit https://example.com.", mode: "explain" },
    { reason: "emoji", text: "Nice work 🙂", mode: "explain" },
    {
      reason: "disallowed-character",
      text: "Nice <b>move</b>.",
      mode: "explain",
    },
    { reason: "unsafe-word", text: "That was stupid.", mode: "explain" },
    { reason: "too-long", text: "a".repeat(221), mode: "explain" },
    { reason: "too-many-sentences", text: "One. Two. Three.", mode: "explain" },
    { reason: "reveals-better-move", text: "Try Nxe5.", mode: "nudge" },
    { reason: "reveals-better-move", text: "Look at e5.", mode: "hint" },
    { reason: "unknown-square", text: "Look at a1.", mode: "explain" },
    { reason: "unknown-move", text: "Try Rxf3#.", mode: "explain" },
    { reason: "digits", text: "There are 2 ideas.", mode: "explain" },
    { reason: "unknown-piece", text: "A queen is waiting.", mode: "explain" },
  ] as const)("falls back with $reason", async ({ reason, text, mode }) => {
    const logged: string[] = [];
    const result = await rephrase({
      client: mockClient(text),
      model: "mock-model",
      input: input(mode),
      log: (entry) => logged.push(entry),
    });

    expect(result).toEqual({
      text: "Can you protect your knight?",
      source: "template",
      reason,
    });
    expect(logged).toEqual([reason]);
  });

  it("falls back with an HTTP error reason", async () => {
    const mock = mockOpenAi({ replies: [{ status: 500 }] });
    const result = await rephrase({
      client: createLlmClient({
        baseUrl: "http://mock.local/v1",
        fetch: mock.app.request.bind(mock.app),
      }),
      model: "mock-model",
      input: input(),
    });

    expect(result).toEqual({
      text: "Can you protect your knight?",
      source: "template",
      reason: "http",
    });
  });

  it("falls back with a bad-response reason", async () => {
    const mock = mockOpenAi({ replies: [{ responseBody: { choices: [] } }] });
    const result = await rephrase({
      client: createLlmClient({
        baseUrl: "http://mock.local/v1",
        fetch: mock.app.request.bind(mock.app),
      }),
      model: "mock-model",
      input: input(),
    });

    expect(result).toEqual({
      text: "Can you protect your knight?",
      source: "template",
      reason: "bad-response",
    });
  });

  it("falls back with a network reason for a rejected fetch", async () => {
    const client = createLlmClient({
      baseUrl: "http://mock.local/v1",
      fetch: async () => {
        throw new Error("connection refused");
      },
    });
    const result = await rephrase({
      client,
      model: "mock-model",
      input: input(),
    });

    expect(result).toEqual({
      text: "Can you protect your knight?",
      source: "template",
      reason: "network",
    });
  });

  it("falls back with a timeout reason at 3000 ms", async () => {
    vi.useFakeTimers();
    const mock = mockOpenAi({
      replies: [{ text: "Too late.", delayMs: 5000 }],
    });
    const result = rephrase({
      client: createLlmClient({
        baseUrl: "http://mock.local/v1",
        fetch: mock.app.request.bind(mock.app),
      }),
      model: "mock-model",
      input: input(),
    });
    await Promise.resolve();
    await Promise.resolve();

    const expectation = expect(result).resolves.toEqual({
      text: "Can you protect your knight?",
      source: "template",
      reason: "timeout",
    });
    await vi.advanceTimersByTimeAsync(3000);
    await expectation;
    await vi.advanceTimersByTimeAsync(2000);
  });

  it("falls back with timeout when immediate headers have a delayed body", async () => {
    vi.useFakeTimers();
    const client = createLlmClient({
      baseUrl: "http://mock.local/v1",
      timeoutMs: 20,
      fetch: async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            // This adapter ignores AbortSignal; the client deadline must still win.
            await new Promise((resolve) => setTimeout(resolve, 100));
            return { choices: [{ message: { content: "Too late." } }] };
          },
        }) as Response,
    });
    const result = rephrase({ client, model: "mock-model", input: input() });
    const expectation = expect(result).resolves.toEqual({
      text: "Can you protect your knight?",
      source: "template",
      reason: "timeout",
    });

    await vi.advanceTimersByTimeAsync(20);
    await expectation;
    await vi.advanceTimersByTimeAsync(80);
  });
});
