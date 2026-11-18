const fallbackLightColor = "#facc15";
const fallbackDarknessColor = "#111827";
const hexColor = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const functionalColor = /^(?:rgb|rgba|hsl|hsla)\(\s*[\d.]+(?:deg|%)?(?:\s*[,\s/]\s*[\d.]+%?){2,3}\s*\)$/i;

/**
 * Light colours come from scene data that any editor (or an import) can write,
 * and the DOM light layer interpolates them into a CSS gradient. Only plain
 * colour values are allowed through, so a crafted value cannot add extra
 * gradient layers or url() requests.
 */
export function safeLightCssColor(color: string | undefined, kind?: string): string {
  const trimmed = color?.trim() ?? "";
  if (hexColor.test(trimmed) || functionalColor.test(trimmed)) return trimmed;
  return kind === "darkness" ? fallbackDarknessColor : fallbackLightColor;
}
