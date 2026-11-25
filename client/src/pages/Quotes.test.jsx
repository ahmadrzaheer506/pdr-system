import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Quotes from './Quotes.jsx';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn() },
  money: (n) => `£${n}`,
  fmtDate: (d) => String(d).slice(0, 10),
}));

function renderQuotes(path = '/quotes') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/quotes" element={<Quotes />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Quotes list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ quotes: [] });
  });

  it('keeps the dashboard issued window on All, and lists drafts without that sent filter', async () => {
    const user = userEvent.setup();
    renderQuotes('/quotes?sent_from=2026-10-24&sent_to=2026-11-23');

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/status=ALL.*sent_from=2026-10-24/));
    });
    expect(screen.getByText(/unsent quotes are in draft/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^draft$/i }));
    await waitFor(() => {
      const draftCall = api.get.mock.calls.map(([url]) => url).find((url) => String(url).includes('status=draft'));
      expect(draftCall).toBeTruthy();
      expect(draftCall).not.toMatch(/sent_from=/);
      expect(draftCall).toMatch(/status=draft/);
    });
    expect(screen.getByText(/have not been emailed or sent on WhatsApp yet/i)).toBeInTheDocument();
  });

  it('still sends the issued window when Sent is selected from the dashboard drill-down', async () => {
    const user = userEvent.setup();
    renderQuotes('/quotes?sent_from=2026-10-24&sent_to=2026-11-23');
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /^sent$/i }));
    await waitFor(() => {
      const sentCall = api.get.mock.calls.map(([url]) => url).find((url) => String(url).includes('status=sent'));
      expect(sentCall).toMatch(/sent_from=2026-10-24/);
      expect(sentCall).toMatch(/status=sent/);
    });
  });
});
