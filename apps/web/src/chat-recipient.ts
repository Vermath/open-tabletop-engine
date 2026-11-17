interface ChatRecipientOption {
  user: { id: string; displayName: string; email?: string | null };
}

/**
 * Resolve a whisper recipient typed by the sender. An exact id, name or email
 * match wins; otherwise a partial match is used only when exactly one member
 * matches, so an ambiguous name never sends a private message to the wrong person.
 */
export function resolveChatRecipientId(options: readonly ChatRecipientOption[], query?: string): string | undefined {
  const normalized = query?.trim().toLocaleLowerCase();
  if (!normalized) return undefined;
  const names = (option: ChatRecipientOption) => [option.user.id, option.user.displayName, option.user.email ?? ""].map((value) => value.toLocaleLowerCase());
  const exact = options.filter((option) => names(option).includes(normalized));
  if (exact.length > 0) return exact.length === 1 ? exact[0]!.user.id : undefined;
  const partial = options.filter((option) => names(option).some((value) => value.includes(normalized)));
  return partial.length === 1 ? partial[0]!.user.id : undefined;
}
