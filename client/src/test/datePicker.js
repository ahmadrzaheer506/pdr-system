import { screen, waitFor } from '@testing-library/react';

function calendarPanel() {
  return document.querySelector('[data-datepicker-panel]');
}

/**
 * Choose YYYY-MM-DD from DatePicker. `field` may be a trigger element or a label matcher.
 */
export async function pickDate(user, field, ymd) {
  const trigger = field && typeof field.getAttribute === 'function'
    ? field
    : screen.getByLabelText(field);
  if (trigger.getAttribute('data-value') === ymd) return;
  if (trigger.getAttribute('aria-expanded') !== 'true') {
    await user.click(trigger);
  }
  await waitFor(() => {
    if (!calendarPanel()) throw new Error('DatePicker calendar did not open');
  });
  const targetMonth = ymd.slice(0, 7);
  for (let i = 0; i < 36; i += 1) {
    const panel = calendarPanel();
    const current = panel.querySelector('[data-calendar-month]')?.getAttribute('data-calendar-month');
    if (current === targetMonth) break;
    if (!current) break;
    const dir = current < targetMonth ? 'Next month' : 'Previous month';
    const nav = [...panel.querySelectorAll('button')].find((btn) => btn.getAttribute('aria-label') === dir);
    if (!nav) throw new Error(`DatePicker missing ${dir} control`);
    await user.click(nav);
  }
  const panel = calendarPanel();
  const day = panel?.querySelector(`[data-date="${ymd}"]`);
  if (!day) throw new Error(`DatePicker has no day ${ymd}`);
  await user.click(day);
}
