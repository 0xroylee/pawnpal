import { isIP } from "node:net";
import { networkInterfaces } from "node:os";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

export type NetworkState = {
  enabled: boolean;
  port: number;
  changing: boolean;
  failed: boolean;
};
export type NetworkMode = {
  current: () => NetworkState;
  set: (enabled: boolean) => void;
};
export const lanSetting = "lan-enabled";

function ipv4Address(address: string) {
  if (isIP(address) === 4) return address;
  if (!address.startsWith("::ffff:")) return undefined;
  const embedded = address.slice(7);
  if (isIP(embedded) === 4) return embedded;
  const pairs = /^([a-f0-9]{1,4}):([a-f0-9]{1,4})$/i.exec(embedded);
  if (!pairs) return undefined;
  const first = parseInt(pairs[1]!, 16);
  const second = parseInt(pairs[2]!, 16);
  return [first >> 8, first & 255, second >> 8, second & 255].join(".");
}

export function isLoopback(address: string) {
  const host = address.toLowerCase();
  return host === "::1" || ipv4Address(host)?.startsWith("127.") === true;
}

export function isPrivateClient(address: string) {
  const host = address.toLowerCase();
  if (isLoopback(host)) return true;
  const v4 = ipv4Address(host);
  if (v4) {
    const [a, b] = v4.split(".").map(Number);
    return (
      a === 10 ||
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  if (isIP(host) !== 6) return false;
  const prefix = parseInt(host.split(":")[0]!, 16);
  return (prefix & 0xfe00) === 0xfc00 || (prefix & 0xffc0) === 0xfe80;
}

export function lanAddresses(interfaces = networkInterfaces()) {
  return [
    ...new Set(
      Object.values(interfaces).flatMap((entries) =>
        (entries ?? [])
          .filter(
            ({ internal, family, address }) =>
              !internal &&
              family === "IPv4" &&
              !isLoopback(address) &&
              isPrivateClient(address),
          )
          .map(({ address }) => address),
      ),
    ),
  ].sort();
}

export function allowedHost(
  host: string,
  port: number,
  addresses: readonly string[],
) {
  return ["localhost", "127.0.0.1", "[::1]", ...addresses].some((address) => {
    const value = host.toLowerCase();
    return value === `${address}:${port}` || (port === 80 && value === address);
  });
}

export function isLocalRequest(context: Context) {
  try {
    return isLoopback(getConnInfo(context).remote.address ?? "");
  } catch {
    return false;
  }
}

export function requestAllowed(context: Context, state: NetworkState) {
  const address = getConnInfo(context).remote.address ?? "";
  if (!(state.enabled ? isPrivateClient(address) : isLoopback(address)))
    return false;
  return allowedHost(
    context.req.header("Host") ?? "",
    state.port,
    state.enabled ? lanAddresses() : [],
  );
}

export function lanUrls(port: number) {
  return lanAddresses().map((address) => `http://${address}:${port}`);
}
