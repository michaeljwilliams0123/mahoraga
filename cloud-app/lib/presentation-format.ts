export type PresentationContext = {
  locale?: string | null;
  timezone?: string | null;
  direction?: "ltr" | "rtl" | "auto" | null;
  unitSystem?: "metric" | "us" | "uk" | null;
  currency?: string | null;
};

function canonicalLocale(locale: string | null | undefined) {
  if (!locale) return "en-US";
  try {
    const canonical = Intl.getCanonicalLocales(locale);
    if (canonical.length !== 1) throw new RangeError("presentation-locale-invalid");
    return canonical[0];
  } catch {
    throw new RangeError("presentation-locale-invalid");
  }
}

function assertTimezone(timezone: string | null | undefined) {
  if (!timezone) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(0);
    return timezone;
  } catch {
    throw new RangeError("presentation-timezone-invalid");
  }
}

function assertCurrency(currency: string | null | undefined) {
  if (!currency) return undefined;
  if (!/^[A-Z]{3}$/.test(currency)) throw new RangeError("presentation-currency-invalid");
  return currency;
}

export function formatPresentationValue(value: string | number | Date, presentation: PresentationContext = {}) {
  const locale = canonicalLocale(presentation.locale);
  const timezone = assertTimezone(presentation.timezone);
  const currency = assertCurrency(presentation.currency);
  if (presentation.direction && !["ltr", "rtl", "auto"].includes(presentation.direction)) {
    throw new RangeError("presentation-direction-invalid");
  }
  if (presentation.unitSystem && !["metric", "us", "uk"].includes(presentation.unitSystem)) {
    throw new RangeError("presentation-unit-system-invalid");
  }
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new RangeError("presentation-date-invalid");
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "medium",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError("presentation-number-invalid");
    return currency
      ? new Intl.NumberFormat(locale, { style: "currency", currency }).format(value)
      : new Intl.NumberFormat(locale).format(value);
  }
  return value;
}
