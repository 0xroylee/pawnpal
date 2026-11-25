import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import { LibraryFault } from "../db/fault.ts";
import type { Library } from "../db/library.ts";

export const parentPinKey = "parent-pin";
const cookieName = "pawnpal_parent";
const idleMs = 15 * 60_000;
const lockMs = 60_000;

function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pin, salt, 32).toString("hex")}`;
}

function matchesPin(pin: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash || !/^[0-9a-f]{64}$/.test(hash)) return false;
  return timingSafeEqual(scryptSync(pin, salt, 32), Buffer.from(hash, "hex"));
}

export class ParentGate {
  readonly #sessions = new Map<string, { pinHash: string; expires: number }>();
  #misses = 0;
  #lockedUntil = 0;
  #lastPin: string | undefined;
  readonly #library: Library;
  readonly #now: () => number;

  constructor(library: Library, now = Date.now) {
    this.#library = library;
    this.#now = now;
  }

  #pinHash() {
    const pin = this.#library.getSetting(parentPinKey);
    if (pin !== this.#lastPin) {
      this.clear();
      this.#lastPin = pin;
    }
    return pin;
  }

  status(context: Context) {
    const pinSet = Boolean(this.#pinHash());
    return {
      pinSet,
      unlocked: this.#authenticated(context),
      retryAfterMs: Math.max(0, this.#lockedUntil - this.#now()),
    };
  }

  #authenticated(context: Context) {
    const pinHash = this.#pinHash();
    const token = getCookie(context, cookieName);
    if (!pinHash || !token) return false;
    const session = this.#sessions.get(token);
    if (!session) return false;
    if (session.pinHash !== pinHash || session.expires <= this.#now()) {
      this.#sessions.delete(token);
      return false;
    }
    session.expires = this.#now() + idleMs;
    return true;
  }

  require(context: Context) {
    if (!this.#authenticated(context))
      throw new LibraryFault(401, "Parent PIN required");
  }

  setPin(context: Context, pin: string) {
    if (this.#pinHash()) this.require(context);
    const pinHash = hashPin(pin);
    this.#library.setSetting(parentPinKey, pinHash);
    this.#pinHash();
    this.#issue(context, pinHash);
  }

  unlock(context: Context, pin: string) {
    const pinHash = this.#pinHash();
    if (!pinHash) throw new LibraryFault(409, "Set a parent PIN first");
    if (this.#now() < this.#lockedUntil)
      throw new LibraryFault(429, "Try again in one minute");
    if (!matchesPin(pin, pinHash)) {
      if (++this.#misses < 5) throw new LibraryFault(401, "Incorrect PIN");
      this.#misses = 0;
      this.#lockedUntil = this.#now() + lockMs;
      throw new LibraryFault(429, "Try again in one minute");
    }
    this.#misses = 0;
    this.#issue(context, pinHash);
  }

  #issue(context: Context, pinHash: string) {
    const oldToken = getCookie(context, cookieName);
    if (oldToken) this.#sessions.delete(oldToken);
    const now = this.#now();
    for (const [token, session] of this.#sessions)
      if (session.expires <= now) this.#sessions.delete(token);
    const token = randomBytes(32).toString("hex");
    this.#sessions.set(token, { pinHash, expires: now + idleMs });
    setCookie(context, cookieName, token, {
      httpOnly: true,
      sameSite: "Strict",
      path: "/api",
      secure: new URL(context.req.url).protocol === "https:",
    });
  }

  clear() {
    this.#sessions.clear();
    this.#misses = 0;
    this.#lockedUntil = 0;
  }
}
