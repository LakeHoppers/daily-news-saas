import { getHourInTimezone } from "@/shared/timezone";

export function isDueNow(timezone: string, digestHour: number, now: Date): boolean {
  return getHourInTimezone(timezone, now) >= digestHour;
}
