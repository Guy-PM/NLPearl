/** Renders `{{field}}` placeholders in an SMS template against a flat data object. */
export function renderTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    const value = data[key];
    return value === undefined || value === null ? match : String(value);
  });
}
