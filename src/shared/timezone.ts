export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** The current hour (0-23) in the given IANA timezone. Assumes `timezone` is valid. */
export function getHourInTimezone(timezone: string, date: Date): number {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hourCycle: "h23",
  }).format(date);
  return Number(hourStr);
}
