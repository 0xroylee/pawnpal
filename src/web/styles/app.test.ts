/// <reference types="node" />
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const componentCss = readFileSync("design/components.css", "utf8");
const appCss = readFileSync("src/web/styles/app.css", "utf8").replace(
  /^@import[^;]+;\s*/gm,
  "",
);
const pawnpalCss = `${componentCss}\n${appCss}`;

let stylesheet: HTMLStyleElement;

beforeEach(() => {
  stylesheet = document.createElement("style");
  stylesheet.textContent = pawnpalCss;
  document.head.append(stylesheet);
});

afterEach(() => {
  stylesheet.remove();
});

function styleRule(selector: string): CSSStyleRule | undefined {
  const rules = Array.from(stylesheet.sheet?.cssRules ?? []);
  const rule = rules.reverse().find(
    (candidate) =>
      "selectorText" in candidate &&
      String(candidate.selectorText)
        .split(",")
        .map((part) => part.trim())
        .includes(selector),
  );

  return rule as CSSStyleRule | undefined;
}

function mediaStyleRule(
  media: string,
  selector: string,
): CSSStyleRule | undefined {
  const rules = Array.from(stylesheet.sheet?.cssRules ?? []);
  const mediaRule = rules.find(
    (candidate) =>
      candidate instanceof CSSMediaRule &&
      candidate.conditionText.includes(media),
  ) as CSSMediaRule | undefined;
  const rule = Array.from(mediaRule?.cssRules ?? []).find(
    (candidate) =>
      "selectorText" in candidate && candidate.selectorText === selector,
  );
  return rule as CSSStyleRule | undefined;
}

describe("app styles", () => {
  it("sizes shared piece images through their board, segment, and promotion CSS", () => {
    expect(styleRule(".pp-sq [data-piece] > img")?.style.width).toBe("92%");
    expect(styleRule(".pp-segment button img")?.style.width).toBe("30px");
    expect(styleRule(".pp-promotion img")?.style.width).toBe("40px");
  });

  it("layers board highlights below pieces and move markers above them", () => {
    const square = document.createElement("div");
    square.className = "pp-sq is-last is-selected is-check";
    const piece = document.createElement("div");
    piece.dataset.piece = "wP";
    square.append(piece);
    document.body.append(square);

    expect(window.getComputedStyle(square).position).toBe("relative");
    expect(window.getComputedStyle(piece).zIndex).toBe("2");
    expect(styleRule(".pp-sq::before")?.style.zIndex).toBe("1");
    expect(styleRule(".pp-sq.is-last::before")?.style.background).toBe(
      "var(--pp-hl-last)",
    );
    expect(styleRule(".pp-sq.is-selected::before")?.style.background).toBe(
      "var(--pp-hl-selected)",
    );
    expect(styleRule(".pp-sq.is-check::before")?.style.background).toBe(
      "var(--pp-hl-check)",
    );
    expect(styleRule(".pp-sq.has-dot::after")?.style.zIndex).toBe("3");
    expect(styleRule(".pp-sq.has-capture::after")?.style.zIndex).toBe("3");
  });

  it("places the coach bubble in the side column and sizes badges from the board", () => {
    expect(styleRule(".pp-game__side-column > .pp-coach")?.style.width).toBe(
      "100%",
    );
    expect(styleRule(".pp-board")?.style.containerType).toBe("inline-size");
    expect(
      styleRule(".pp-board .pp-sq")?.style.getPropertyValue("--board"),
    ).toBe("100cqi");
    expect(styleRule(".pp-sq__badge")?.style.fontSize).toContain("var(--board");
    expect(styleRule(".pp-player__hint")?.style.marginLeft).toBe("auto");
  });

  it("gives the board column a definite desktop and portrait width", () => {
    expect(styleRule(".pp-game__board-column")?.style.width).toBe("576px");
    expect(styleRule(".pp-game__board-column")?.style.maxWidth).toBe("100%");
    expect(styleRule(".pp-board")?.style.width).toBe("100%");
    expect(
      mediaStyleRule("max-width: 980px", ".pp-game__layout")?.style
        .gridTemplateColumns,
    ).toBe("minmax(0, 1fr)");
    expect(
      mediaStyleRule("max-width: 980px", ".pp-game__board-column")?.style.width,
    ).toBe("100%");
    expect(
      mediaStyleRule("max-width: 980px", ".pp-game__board-column")?.style
        .maxWidth,
    ).toBe("var(--pp-board-target)");
    expect(
      mediaStyleRule("max-width: 980px", ".pp-game__side-column")?.style
        .maxWidth,
    ).toBe("var(--pp-board-target)");
  });

  it("keeps the live announcement available to screen readers without showing it twice", () => {
    const live = styleRule(".pp-game__live")?.style;
    expect(live?.position).toBe("absolute");
    expect(live?.width).toBe("1px");
    expect(live?.height).toBe("1px");
    expect(live?.overflow).toBe("hidden");
    expect(live?.clip).toBe("rect(0px, 0px, 0px, 0px)");
  });

  it("keeps the title centered while the Home button sizes to its content", () => {
    const topbar = document.createElement("header");
    topbar.className = "pp-game__topbar";
    const home = document.createElement("button");
    home.className = "pp-game__home";
    const title = document.createElement("h1");
    const actions = document.createElement("div");
    actions.className = "pp-game__actions";
    topbar.append(home, title, actions);
    document.body.append(topbar);

    expect(window.getComputedStyle(topbar).gridTemplateColumns).toBe(
      "1fr auto 1fr",
    );
    expect(window.getComputedStyle(home).justifySelf).toBe("start");
    expect(window.getComputedStyle(actions).justifyContent).toBe("flex-end");
  });

  it("uses the kit's spacing, type, and ink tokens in application styles", () => {
    expect(styleRule(".pp-setup__card")?.style.gap).toBe("var(--pp-space-6)");
    expect(styleRule(".pp-setup__card h1")?.style.fontSize).toBe(
      "clamp(var(--pp-text-2xl), 6vw, var(--pp-text-3xl))",
    );
    expect(styleRule(".pp-game__topbar h1")?.style.fontSize).toBe(
      "var(--pp-text-xl)",
    );
    expect(styleRule(".pp-promotion-backdrop")?.style.background).toContain(
      "var(--pp-ink)",
    );
  });
});
