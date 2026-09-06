/**
 * The app's only icon set. Inline SVG rather than the `×` / `↑` / `←` glyphs
 * that used to sit in these buttons: those inherit the text metrics, so they
 * never centre in a square button and their weight drifts with the font.
 *
 * Every icon is `aria-hidden`. The buttons that use them all carry their own
 * `aria-label`, which stays the accessible name — nothing here is ever the
 * only label for a control.
 *
 * Presentational only, no domain knowledge, per the `ui/` layer contract.
 */
export type IconName = 'close' | 'arrowUp' | 'arrowDown' | 'chevronLeft' | 'chevronRight';

const PATHS: Record<IconName, string> = {
  close: 'M4 4 L12 12 M12 4 L4 12',
  arrowUp: 'M8 12.5 V4 M4.75 7.25 L8 4 L11.25 7.25',
  arrowDown: 'M8 3.5 V12 M4.75 8.75 L8 12 L11.25 8.75',
  chevronLeft: 'M10 3.5 L5.5 8 L10 12.5',
  chevronRight: 'M6 3.5 L10.5 8 L6 12.5',
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
