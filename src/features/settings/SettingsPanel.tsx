import { useState } from 'react';
import { useStore, useStoreVersion } from '@/app/storeContext';
import styles from './SettingsPanel.module.css';

interface FieldProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly unit: string;
  readonly hint?: string;
  readonly onChange: (value: number) => void;
}

/**
 * A clamped number field that is still typeable.
 *
 * The field has to tolerate being momentarily empty or out of range while the
 * user edits it — clamping on every keystroke means clearing the box snaps it
 * to the minimum and the next digit appends to that, so typing "40" produces
 * "140". So: a local draft during editing, live commits only while the value is
 * valid and in range, and a clamp on blur. The stored setting is never allowed
 * out of range, which is what protects the accountability math.
 */
function NumberField({ label, value, min, max, unit, hint, onChange }: FieldProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const commitFinal = () => {
    if (draft !== null) {
      const parsed = Number(draft);
      if (draft.trim() !== '' && Number.isFinite(parsed)) {
        onChange(Math.min(max, Math.max(min, Math.round(parsed))));
      }
    }
    setDraft(null);
  };

  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={styles.inputRow}>
        <input
          type="number"
          className={styles.input}
          value={draft ?? String(value)}
          min={min}
          max={max}
          aria-label={label}
          onChange={(event) => {
            const raw = event.target.value;
            setDraft(raw);
            const parsed = Number(raw);
            if (raw.trim() === '' || !Number.isFinite(parsed)) return;
            if (parsed < min || parsed > max) return;
            onChange(Math.round(parsed));
          }}
          onBlur={commitFinal}
        />
        <span className={styles.unit}>{unit}</span>
      </span>
      {hint !== undefined ? <span className={styles.hint}>{hint}</span> : null}
    </label>
  );
}

/**
 * Editable settings.
 *
 * The work interval is here because brief section 4 asks for it explicitly: the
 * intent is to raise it from 25 toward 40 over the coming weeks as focus
 * improves, so it must not be hardcoded.
 */
export function SettingsPanel() {
  const store = useStore();
  useStoreVersion();
  const settings = store.settings;

  return (
    <section className={styles.panel} aria-label="Settings">
      <div className={styles.group}>
        <h2 className={styles.groupTitle}>Pomodoro</h2>
        <div className={styles.fields}>
          <NumberField
            label="Work interval"
            value={settings.workIntervalMinutes}
            min={1}
            max={180}
            unit="min"
            hint="Raise this as focus improves. Sessions can always run past it."
            onChange={(workIntervalMinutes) => store.updateSettings({ workIntervalMinutes })}
          />
          <NumberField
            label="Short break"
            value={settings.shortBreakMinutes}
            min={1}
            max={60}
            unit="min"
            onChange={(shortBreakMinutes) => store.updateSettings({ shortBreakMinutes })}
          />
          <NumberField
            label="Long break"
            value={settings.longBreakMinutes}
            min={1}
            max={120}
            unit="min"
            onChange={(longBreakMinutes) => store.updateSettings({ longBreakMinutes })}
          />
          <NumberField
            label="Long break every"
            value={settings.longBreakEvery}
            min={1}
            max={12}
            unit="pomodoros"
            onChange={(longBreakEvery) => store.updateSettings({ longBreakEvery })}
          />
        </div>
      </div>

      <div className={styles.group}>
        <h2 className={styles.groupTitle}>Accountability</h2>
        <div className={styles.fields}>
          <NumberField
            label="Workday length"
            value={Math.round(settings.allocatedMinutesPerWorkday / 60)}
            min={1}
            max={16}
            unit="hours"
            hint="Allocated time per Sun–Thu. Applies to days created from now on; days already logged keep their own figure."
            onChange={(hours) =>
              store.updateSettings({ allocatedMinutesPerWorkday: hours * 60 })
            }
          />
          <NumberField
            label="Streak threshold"
            value={Math.round(settings.workStreakThresholdMinutes / 60)}
            min={1}
            max={16}
            unit="hours"
            hint="Actual work needed for a day to hold the streak. Recalculates history immediately."
            onChange={(hours) =>
              store.updateSettings({ workStreakThresholdMinutes: hours * 60 })
            }
          />
        </div>
      </div>

      <div className={styles.group}>
        <h2 className={styles.groupTitle}>Current project</h2>
        <input
          type="text"
          className={styles.textInput}
          value={settings.currentProject}
          aria-label="Current project"
          onChange={(event) => store.updateSettings({ currentProject: event.target.value })}
        />
        <p className={styles.hint}>
          Shown for context only — tracked time is never split per project.
        </p>
      </div>

      <p className={styles.note}>
        A day is 04:00 to 03:59, so work past midnight counts toward the day it started.
        Friday and Saturday are off days: never allocated, never counted against a streak.
        The timer is silent by design — no sounds, no notifications.
      </p>
    </section>
  );
}
