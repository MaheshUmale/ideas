export type Metric = { key: string; label: string; current: number; previous?: number; target?: number; sourceRange: string };

export function insight(m: Metric): string {
  if (m.target !== undefined) {
    const d = (m.current - m.target) / Math.abs(m.target || 1);
    if (Math.abs(d) >= 0.05) return `${m.label} is ${Math.abs(d * 100).toFixed(1)}% ${d > 0 ? "above" : "below"} target.`;
  }
  if (m.previous !== undefined) {
    const d = (m.current - m.previous) / Math.abs(m.previous || 1);
    return `${m.label} ${d >= 0 ? "increased" : "decreased"} ${Math.abs(d * 100).toFixed(1)}% versus the previous period.`;
  }
  return `${m.label} is ${m.current.toLocaleString()}.`;
}

export function replacePlaceholders(template: string, values: Record<string, string>) {
  for (const key of Object.keys(values)) {
    if (!template.includes(`{{${key}}}`)) throw new Error(`Missing placeholder: ${key}`);
  }
  return Object.entries(values).reduce((text, [key, value]) => text.split(`{{${key}}}`).join(value), template);
}
