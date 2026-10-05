import { screen } from '@testing-library/react';

/**
 * Choose an option from SelectMenu. `option` may be the option value or a name matcher.
 */
export async function pickSelectOption(user, field, option) {
  const trigger = field && typeof field.getAttribute === 'function'
    ? field
    : screen.getByLabelText(field);
  await user.click(trigger);
  const options = screen.getAllByRole('option');
  const byValue = typeof option === 'string'
    ? options.find((el) => el.getAttribute('data-value') === option)
    : null;
  await user.click(byValue || screen.getByRole('option', { name: option }));
}
