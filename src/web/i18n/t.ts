import messages from "./en.json";

export type MessageKey = keyof typeof messages;
export type MessageParams = Record<string, string | number>;

export function t(key: MessageKey, params: MessageParams = {}): string {
  const message = messages[key];
  return message.replace(/\{([\w.-]+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name)
      ? String(params[name])
      : placeholder,
  );
}
