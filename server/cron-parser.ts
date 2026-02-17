/**
 * Interval & cron expression parser.
 * No external dependencies — simple inline matching.
 */

const INTERVAL_RE = /^every\s+(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?)$/i;

const UNIT_MS: Record<string, number> = {
  s: 1000, sec: 1000, second: 1000, seconds: 1000,
  m: 60_000, min: 60_000, minute: 60_000, minutes: 60_000,
  h: 3_600_000, hr: 3_600_000, hour: 3_600_000, hours: 3_600_000,
  d: 86_400_000, day: 86_400_000, days: 86_400_000,
};

export function parseIntervalMs(expr: string): number | null {
  const match = expr.trim().match(INTERVAL_RE);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const ms = UNIT_MS[unit];
  if (!ms || value <= 0) return null;
  return value * ms;
}

export function nextRunFromInterval(expr: string): string | null {
  const ms = parseIntervalMs(expr);
  if (!ms) return null;
  return new Date(Date.now() + ms).toISOString();
}

/** Parse a single cron field against a range [min, max]. Returns matching values. */
function parseCronField(field: string, min: number, max: number): number[] {
  const results = new Set<number>();

  for (const part of field.split(",")) {
    const trimmed = part.trim();

    // Wildcard
    if (trimmed === "*") {
      for (let i = min; i <= max; i++) results.add(i);
      continue;
    }

    // Step: */n or n-m/s
    const stepMatch = trimmed.match(/^(\*|(\d+)-(\d+))\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[4], 10);
      const start = stepMatch[2] != null ? parseInt(stepMatch[2], 10) : min;
      const end = stepMatch[3] != null ? parseInt(stepMatch[3], 10) : max;
      for (let i = start; i <= end; i += step) results.add(i);
      continue;
    }

    // Range: n-m
    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const from = parseInt(rangeMatch[1], 10);
      const to = parseInt(rangeMatch[2], 10);
      for (let i = from; i <= to; i++) results.add(i);
      continue;
    }

    // Single value
    const val = parseInt(trimmed, 10);
    if (!isNaN(val) && val >= min && val <= max) {
      results.add(val);
    }
  }

  return Array.from(results).sort((a, b) => a - b);
}

export function nextRunFromCron(expr: string): string | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const minutes = parseCronField(parts[0], 0, 59);
  const hours = parseCronField(parts[1], 0, 23);
  const daysOfMonth = parseCronField(parts[2], 1, 31);
  const months = parseCronField(parts[3], 1, 12);
  const daysOfWeek = parseCronField(parts[4], 0, 6);

  if (!minutes.length || !hours.length || !daysOfMonth.length || !months.length || !daysOfWeek.length) {
    return null;
  }

  const now = new Date();
  // Search up to 366 days ahead
  const limit = new Date(now.getTime() + 366 * 86_400_000);
  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  while (candidate <= limit) {
    const mo = candidate.getMonth() + 1;
    const dom = candidate.getDate();
    const dow = candidate.getDay();
    const hr = candidate.getHours();
    const mn = candidate.getMinutes();

    if (
      months.includes(mo) &&
      daysOfMonth.includes(dom) &&
      daysOfWeek.includes(dow) &&
      hours.includes(hr) &&
      minutes.includes(mn)
    ) {
      return candidate.toISOString();
    }

    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  return null;
}

/** Detect whether an expression is cron or interval */
export function isInterval(expr: string): boolean {
  return INTERVAL_RE.test(expr.trim());
}

export function computeNextRun(expr: string): string | null {
  return isInterval(expr) ? nextRunFromInterval(expr) : nextRunFromCron(expr);
}
