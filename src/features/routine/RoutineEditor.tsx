import { useState } from 'react';
import { formatTimeOfDay, parseTimeOfDay } from '@/domain';
import type { RoutineView } from './useRoutine';
import styles from './RoutinePanel.module.css';

/**
 * Edits the routine template.
 *
 * Every change here applies to days created from now on. Today's blocks and
 * every past day render from their own stored snapshot and are untouched
 * (brief section 7) — the note below says so, because it is not obvious.
 */
export function RoutineEditor({ routine }: { readonly routine: RoutineView }) {
  const [newName, setNewName] = useState('');

  return (
    <div className={styles.editor}>
      <p className={styles.editorNote}>
        Changes apply to future days. Days already logged, including today, keep the routine they
        were created with.
      </p>

      <ul className={styles.editorList}>
        {routine.template.blocks.map((block, index) => (
          <li key={block.id} className={styles.editorRow}>
            <input
              type="text"
              className={styles.editorName}
              value={block.name}
              aria-label={`Name of ${block.name}`}
              onChange={(event) => routine.editRoutineBlock(block.id, { name: event.target.value })}
            />
            <input
              type="time"
              className={styles.editorTime}
              value={formatTimeOfDay(block.startMinute)}
              aria-label={`Start time of ${block.name}`}
              onChange={(event) =>
                routine.editRoutineBlock(block.id, {
                  startMinute: event.target.value === '' ? null : parseTimeOfDay(event.target.value),
                })
              }
            />
            <input
              type="number"
              min="0"
              className={styles.editorDuration}
              value={block.durationMinutes ?? ''}
              placeholder="min"
              aria-label={`Timer length of ${block.name}`}
              onChange={(event) =>
                routine.editRoutineBlock(block.id, {
                  durationMinutes: event.target.value === '' ? null : Number(event.target.value),
                })
              }
            />
            <span className={styles.editorActions}>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`Move ${block.name} up`}
                disabled={index === 0}
                onClick={() => routine.moveRoutineBlock(block.id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`Move ${block.name} down`}
                disabled={index === routine.template.blocks.length - 1}
                onClick={() => routine.moveRoutineBlock(block.id, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`Remove ${block.name}`}
                onClick={() => routine.removeRoutineBlock(block.id)}
              >
                ×
              </button>
            </span>
          </li>
        ))}
      </ul>

      <form
        className={styles.editorAdd}
        onSubmit={(event) => {
          event.preventDefault();
          routine.addRoutineBlock(newName);
          setNewName('');
        }}
      >
        <input
          type="text"
          className={styles.editorName}
          value={newName}
          placeholder="Add a block"
          aria-label="New block name"
          onChange={(event) => setNewName(event.target.value)}
        />
        <button type="submit" className={styles.secondary}>
          Add
        </button>
      </form>

      <label className={styles.projectField}>
        <span>Current project</span>
        <input
          type="text"
          className={styles.editorName}
          value={routine.currentProject}
          onChange={(event) => routine.setCurrentProject(event.target.value)}
        />
      </label>
    </div>
  );
}
