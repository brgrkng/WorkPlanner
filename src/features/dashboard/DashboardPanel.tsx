import { msToRoundedMinutes, type Granularity } from '@/domain';
import { Icon } from '@/ui';
import { AllocationMeter } from './AllocationMeter';
import { DayDetail } from './DayDetail';
import { Deadlines } from './Deadlines';
import { useDashboard } from './useDashboard';
import styles from './DashboardPanel.module.css';

const GRANULARITIES: readonly { value: Granularity; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'all', label: 'All time' },
];

function formatDuration(ms: number): string {
  const minutes = msToRoundedMinutes(ms);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** A stat tile — the right form for a single number, rather than a chart. */
function Stat({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail?: string | undefined;
}) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      {detail !== undefined ? <span className={styles.statDetail}>{detail}</span> : null}
    </div>
  );
}

export function DashboardPanel() {
  const dashboard = useDashboard();
  const { totals, workStreak, cigaretteStreak } = dashboard;
  const distraction = totals.distraction;
  const answered = distraction.yes + distraction.no;

  return (
    <section className={styles.panel} aria-label="Dashboard">
      <header className={styles.header}>
        <div className={styles.tabs} role="tablist" aria-label="Time range">
          {GRANULARITIES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={dashboard.granularity === option.value}
              className={
                dashboard.granularity === option.value ? styles.tabActive : styles.tab
              }
              onClick={() => dashboard.setGranularity(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className={styles.nav}>
          <button
            type="button"
            className={styles.navButton}
            aria-label="Previous period"
            disabled={!dashboard.canGoBack}
            onClick={dashboard.goBack}
          >
            <Icon name="chevronLeft" />
          </button>
          <span className={styles.periodLabel}>{dashboard.label}</span>
          <button
            type="button"
            className={styles.navButton}
            aria-label="Next period"
            disabled={!dashboard.canGoForward}
            onClick={dashboard.goForward}
          >
            <Icon name="chevronRight" />
          </button>
        </div>
      </header>

      <div className={styles.main}>
        <AllocationMeter
          totals={totals}
          ratio={dashboard.ratio}
          shortfallMs={dashboard.shortfallMs}
          overtimeMs={dashboard.overtimeMs}
        />

        <div className={styles.stats}>
          <Stat
            label="Work streak"
            value={`${workStreak.current}`}
            detail={
              workStreak.todayPending
                ? 'today still open'
                : workStreak.longest > workStreak.current
                  ? `best ${workStreak.longest}`
                  : undefined
            }
          />
          <Stat
            label="Clean streak"
            value={`${cigaretteStreak.current}`}
            detail={
              dashboard.cigarettesToday > 0
                ? `${dashboard.cigarettesToday} today`
                : `best ${cigaretteStreak.longest}`
            }
          />
          <Stat
            label="Stayed focused"
            value={answered === 0 ? '—' : `${distraction.yes}/${answered}`}
            detail={
              distraction.unanswered > 0 ? `${distraction.unanswered} unanswered` : 'blocks'
            }
          />
          <Stat
            label="Cigarettes"
            value={`${totals.cigarettes}`}
            detail="this period"
          />
        </div>
      </div>

      {/* The numbers behind the chart, always available as text. */}
      <dl className={styles.breakdown}>
        <div>
          <dt>Allocated</dt>
          <dd>{formatDuration(totals.allocatedMs)}</dd>
        </div>
        <div>
          <dt>Actual</dt>
          <dd>{formatDuration(totals.actualMs)}</dd>
        </div>
        <div>
          <dt>Lunch</dt>
          <dd>{formatDuration(totals.lunchMs)}</dd>
        </div>
        <div>
          <dt>Workdays</dt>
          <dd>{totals.workdaysCounted}</dd>
        </div>
        <div>
          <dt>Missed</dt>
          <dd>{totals.missedDays}</dd>
        </div>
        <div>
          <dt>Excused</dt>
          <dd>{totals.excusedDays}</dd>
        </div>
      </dl>

      {dashboard.granularity === 'day' ? (
        <DayDetail
          dayKey={dashboard.anchor}
          log={dashboard.dayLog}
          onExcusedChange={dashboard.setExcused}
        />
      ) : null}

      <Deadlines dashboard={dashboard} />
    </section>
  );
}
