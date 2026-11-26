export type CliFlags = Record<string, string>;

export function parseCliArgs(
  args: string[],
  requiredFlags: string[] = [],
): CliFlags {
  const flags: CliFlags = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token?.startsWith("--") || token.length === 2) {
      throw new Error(`Expected a --flag, received ${JSON.stringify(token)}`);
    }

    const name = token.slice(2);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(name)) {
      throw new Error(`Invalid flag ${JSON.stringify(token)}`);
    }
    if (Object.hasOwn(flags, name)) {
      throw new Error(`Duplicate flag --${name}`);
    }

    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }
    flags[name] = value;
    index += 1;
  }

  for (const required of requiredFlags) {
    const name = required.startsWith("--") ? required.slice(2) : required;
    if (!Object.hasOwn(flags, name)) {
      throw new Error(`Missing required flag --${name}`);
    }
  }

  return flags;
}
