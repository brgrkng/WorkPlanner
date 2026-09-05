import type { DayLog, OfflineReport } from './types';

/** Cigarette counts are never negative; a mis-tap must not corrupt the streak. */
export function clampCigarettes(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/**
 * An outage self-report (brief section 5).
 *
 * `worked: false` contributes to nothing and must never drive punitive UI — the
 * point of the control is to make honesty cheap, not to add guilt.
 */
export function createOfflineReport(
  id: string,
  minutes: number,
  worked: boolean,
  startedAt: number,
  note = '',
): OfflineReport {
  return {
    id,
    startedAt,
    minutes: Math.max(0, Math.round(minutes)),
    worked,
    note,
  };
}

export function addOfflineReport(log: DayLog, report: OfflineReport): DayLog {
  return { ...log, offlineReports: [...log.offlineReports, report] };
}

export function removeOfflineReport(log: DayLog, reportId: string): DayLog {
  return { ...log, offlineReports: log.offlineReports.filter((r) => r.id !== reportId) };
}
