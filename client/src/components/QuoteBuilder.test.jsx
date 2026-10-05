import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuoteBuilder from './QuoteBuilder.jsx';
import { api } from '../lib/api';
import { pickSelectOption } from '../test/selectMenu.js';

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    download: vi.fn(),
  },
  money: (n) => `£${n}`,
}));

  const CUSTOMER = {
  id: 1,
  name: 'Dave Whitfield',
  customer_type: 'domestic',
  sites: [{ id: 1, address: '14 Elm Grove', postcode: 'RG1', is_primary: true }],
  phones: [{ id: 2, value: '07700', type: 'mobile', is_primary: true }],
  emails: [{ id: 3, value: 'dave@example.com', type: 'personal', is_primary: true }],
};

const CATALOGUE = [
  {
    id: 'felt_3layer',
    description: 'Supply & fit 3-layer torch-on felt system',
    unit: 'm²',
    unit_price: 42,
    vat_code: 'standard',
    kind: 'materials',
  },
];

describe('QuoteBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({
      defaults: {
        payment_schedule: [
          { label: 'Deposit on acceptance', percent: 25, trigger: 'On written acceptance of this quotation' },
          { label: 'Balance on completion', percent: 75, trigger: 'On practical completion of the works' },
        ],
        warranty_years: 10,
      },
      catalogue: CATALOGUE,
      vat_rates: [
        { code: 'standard', rate: 20, short: '20%', label: 'Standard 20%' },
        { code: 'high', rate: 50, short: '50%', label: 'High 50%' },
      ],
    });
    api.post.mockImplementation(async (url, body = {}) => {
      if (url === '/quotes/preview') {
        const ps = (body.provisional_sums || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
        const include = !!body.provisional_sums_in_total;
        return {
          total: 1200,
          subtotal: 1000,
          vat_treatment: body.vat_treatment || 'standard',
          vat_breakdown: [],
          cis_applies: !!body.cis_applies,
          cis_deduction: 0,
          retention_amount: Number(body.retention_percent) ? 50 : 0,
          retention_percent: Number(body.retention_percent) || 0,
          reverse_charge_vat: body.vat_treatment === 'reverse_charge' ? 200 : 0,
          provisional_sums_total: ps,
          provisional_sums_in_total: include,
          optional_extras_total: (body.optional_extras || []).reduce((s, r) => s + (Number(r.amount) || 0), 0),
          grand_total: 1200 + (include ? ps : 0),
          due_now: 1200 + (include ? ps : 0),
        };
      }
      return { total: 1200 };
    });
  });

  it('keeps Download PDF disabled until the quote is saved (requirement 6.6)', async () => {
    render(
      <QuoteBuilder open onClose={() => {}} customerId={1} customer={CUSTOMER} onSaved={() => {}} />
    );
    await screen.findByLabelText(/^item 1$/i);
    expect(screen.getByRole('button', { name: /download pdf/i })).toBeDisabled();
  });

  it('treats cis_applies as a boolean and payment_schedule as an object array', async () => {
    const user = userEvent.setup();
    render(
      <QuoteBuilder
        open
        onClose={() => {}}
        customerId={1}
        customer={CUSTOMER}
        existingQuote={{
          title: 'Felt replacement',
          items: [{ description: 'Felt', qty: 1, unit_price: 180, vat_code: 'standard', kind: 'materials' }],
          cis_applies: true,
          cis_rate: 20,
          payment_schedule: [
            { label: 'Deposit', percent: 25, trigger: 'On acceptance' },
          ],
          provisional_sums: [],
        }}
        onSaved={() => {}}
      />
    );

    expect(await screen.findByDisplayValue('Felt replacement')).toBeInTheDocument();
    expect(screen.getByText(/CIS 20%/)).toBeInTheDocument();
    expect(screen.getByText(/1 payment stage/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /VAT, CIS/i }));
    expect(screen.getByLabelText(/Apply CIS deduction/i)).toBeChecked();
  });

  it('defaults a new commercial quote to reverse charge and CIS 20%', async () => {
    render(
      <QuoteBuilder
        open
        onClose={() => {}}
        customerId={1}
        customer={{ ...CUSTOMER, customer_type: 'commercial' }}
        onSaved={() => {}}
      />
    );
    await screen.findByLabelText(/^item 1$/i);
    expect(screen.getByText(/Reverse charge/)).toBeInTheDocument();
    expect(screen.getByText(/CIS 20%/)).toBeInTheDocument();
    expect(screen.getByText(/5% retention/)).toBeInTheDocument();
    expect(await screen.findByText(/2 payment stages/)).toBeInTheDocument();
  });

  it('defaults a new domestic quote to 0% retention', async () => {
    render(
      <QuoteBuilder
        open
        onClose={() => {}}
        customerId={1}
        customer={CUSTOMER}
        onSaved={() => {}}
      />
    );
    await screen.findByLabelText(/^item 1$/i);
    await userEvent.setup().click(screen.getByRole('button', { name: /VAT, CIS/i }));
    expect(screen.getByLabelText(/Retention held back/i)).toHaveValue(0);
  });

  it('lets office override commercial tax defaults on the quote', async () => {
    const user = userEvent.setup();
    render(
      <QuoteBuilder
        open
        onClose={() => {}}
        customerId={1}
        customer={{ ...CUSTOMER, customer_type: 'commercial' }}
        onSaved={() => {}}
      />
    );
    await screen.findByLabelText(/^item 1$/i);
    await user.click(screen.getByRole('button', { name: /VAT, CIS/i }));
    await pickSelectOption(user, /VAT treatment/i, 'standard');
    await user.click(screen.getByLabelText(/Apply CIS deduction/i));
    expect(screen.getByLabelText(/Apply CIS deduction/i)).not.toBeChecked();
    expect(screen.getByText(/Standard VAT/)).toBeInTheDocument();
  });

  it('fills a line from the catalogue and lets the unit price be overridden (requirement 6.1)', async () => {
    const user = userEvent.setup();
    render(
      <QuoteBuilder open onClose={() => {}} customerId={1} customer={CUSTOMER} onSaved={() => {}} />
    );
    await screen.findByLabelText(/^item 1$/i);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/quotes/meta/options');
    });
    const item = screen.getByLabelText(/^item 1$/i);
    await user.click(item);
    await user.click(await screen.findByRole('option', { name: /3-layer torch-on felt/i }));
    expect(item).toHaveValue('Supply & fit 3-layer torch-on felt system');
    expect(screen.getByDisplayValue('m²')).toBeInTheDocument();
    const price = screen.getByLabelText(/unit price 1/i);
    expect(price).toHaveValue(42);
    await user.clear(price);
    await user.type(price, '50');
    expect(price).toHaveValue(50);
    expect(screen.getByText('50.00')).toBeInTheDocument();
  });

  it('keeps guarantee terms in their own section (requirement 6.5)', async () => {
    const user = userEvent.setup();
    render(
      <QuoteBuilder open onClose={() => {}} customerId={1} customer={CUSTOMER} onSaved={() => {}} />
    );
    await screen.findByLabelText(/^item 1$/i);
    expect(screen.getByText(/10 year guarantee/i)).toBeInTheDocument();
    expect(screen.getByText(/2 payment stages/)).toBeInTheDocument();
    expect(screen.queryByText(/10yr guarantee/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Guarantee terms/i }));
    expect(screen.getByLabelText(/Guarantee \(years\)/i)).toHaveValue(10);
    expect(screen.getByLabelText(/Guarantee wording/i)).toBeInTheDocument();
  });

  it('lists optional extras after the works total and never includes them', async () => {
    const user = userEvent.setup();
    render(
      <QuoteBuilder open onClose={() => {}} customerId={1} customer={CUSTOMER} onSaved={() => {}} />
    );
    await screen.findByLabelText(/^item 1$/i);
    await user.click(screen.getByRole('button', { name: /Payment schedule/i }));
    await user.click(screen.getByRole('button', { name: /Add optional extra/i }));
    const amount = screen.getByLabelText(/optional extra amount 1/i);
    await user.clear(amount);
    await user.type(amount, '640');
    await waitFor(() => {
      expect(screen.getByText('Optional extras (not included)')).toBeInTheDocument();
    });
    expect(screen.queryByText('£1840')).not.toBeInTheDocument();
  });

  it('downloads a PDF for a saved quote without sending (requirement 6.6)', async () => {
    const user = userEvent.setup();
    api.post.mockImplementation(async (url, body = {}) => {
      if (url === '/quotes/preview') {
        return { total: 1200, subtotal: 1000, vat_breakdown: [], grand_total: 1200, due_now: 1200 };
      }
      if (url === '/quotes/9/pdf') return { pdf: 'quote-Q-2026-0009.pdf' };
      return { total: 1200 };
    });
    render(
      <QuoteBuilder
        open
        onClose={() => {}}
        customerId={1}
        customer={CUSTOMER}
        existingQuote={{
          id: 9,
          ref: 'Q-2026-0009',
          status: 'draft',
          title: 'Felt',
          items: [{ description: 'Felt', qty: 1, unit_price: 180, vat_code: 'standard', kind: 'materials' }],
          optional_extras: [],
        }}
        onSaved={() => {}}
      />
    );
    await screen.findByText(/Edit quote Q-2026-0009/);
    await user.click(screen.getByRole('button', { name: /download pdf/i }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/quotes/9/pdf');
    });
    expect(api.download).toHaveBeenCalledWith('/files/quote-Q-2026-0009.pdf?download=1', 'Q-2026-0009.pdf');
    expect(api.post).not.toHaveBeenCalledWith('/quotes/9/send', expect.anything());
  });

  it('sends a saved quote from the builder without closing it (requirement 6.7)', async () => {
    const user = userEvent.setup();
    api.post.mockImplementation(async (url, body = {}) => {
      if (url === '/quotes/preview') {
        return { total: 1200, subtotal: 1000, vat_breakdown: [], grand_total: 1200, due_now: 1200 };
      }
      if (url === '/quotes/9/send') return { ok: true, pdf: 'quote-Q-2026-0009.pdf' };
      return { total: 1200 };
    });
    render(
      <QuoteBuilder
        open
        onClose={() => {}}
        customerId={1}
        customer={CUSTOMER}
        existingQuote={{
          id: 9,
          ref: 'Q-2026-0009',
          status: 'draft',
          title: 'Felt',
          items: [{ description: 'Felt', qty: 1, unit_price: 180, vat_code: 'standard', kind: 'materials' }],
          optional_extras: [],
        }}
        onSaved={() => {}}
      />
    );
    await screen.findByText(/Edit quote Q-2026-0009/);
    await user.click(screen.getByRole('button', { name: /send whatsapp/i }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/quotes/9/send', { channels: ['whatsapp'] });
    });
    expect(screen.getByText(/Quote sent via WhatsApp/i)).toBeInTheDocument();
  });

  it('keeps Send disabled until the quote is saved (requirement 6.7)', async () => {
    render(
      <QuoteBuilder open onClose={() => {}} customerId={1} customer={CUSTOMER} onSaved={() => {}} />
    );
    await screen.findByLabelText(/^item 1$/i);
    expect(screen.getByRole('button', { name: /send whatsapp/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /send email/i })).toBeDisabled();
  });

  it('clones a decided quote with the title from the form', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ id: 12, ref: 'Q-2026-0012' });
    render(
      <QuoteBuilder
        open
        onClose={() => {}}
        customerId={1}
        customer={CUSTOMER}
        existingQuote={{
          id: 9,
          ref: 'Q-2026-0009',
          status: 'accepted',
          title: 'Felt',
          items: [{ description: 'Felt', qty: 1, unit_price: 180, vat_code: 'standard', kind: 'materials' }],
          optional_extras: [],
        }}
        onSaved={() => {}}
      />
    );
    await screen.findByText(/Edit quote Q-2026-0009/);
    expect(screen.getByText(/This quote is accepted/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send whatsapp/i })).not.toBeInTheDocument();
    const title = screen.getByPlaceholderText(/full re-roof/i);
    await user.clear(title);
    await user.type(title, 'Felt rear');
    await user.click(screen.getByRole('button', { name: /clone quote/i }));
    expect(api.post).toHaveBeenCalledWith('/quotes/9/clone', { title: 'Felt rear' });
    expect(api.put).not.toHaveBeenCalled();
  });

  it('lists provisional sums after the works total and includes them only when toggled on', async () => {
    const user = userEvent.setup();
    render(
      <QuoteBuilder open onClose={() => {}} customerId={1} customer={CUSTOMER} onSaved={() => {}} />
    );
    await screen.findByLabelText(/^item 1$/i);
    await user.click(screen.getByRole('button', { name: /Payment schedule/i }));
    await user.click(screen.getByRole('button', { name: /Add provisional sum/i }));
    const amount = screen.getByLabelText(/provisional sum amount 1/i);
    await user.clear(amount);
    await user.type(amount, '400');
    await waitFor(() => {
      expect(screen.getByText('Provisional sums (not included)')).toBeInTheDocument();
    });
    expect(screen.queryByText('Grand total')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/Include provisional sums in the grand total/i));
    await waitFor(() => {
      expect(screen.getByText('Grand total')).toBeInTheDocument();
      expect(screen.getByText('£1600')).toBeInTheDocument();
    });
  });

  it('still allows a free-text line', async () => {
    const user = userEvent.setup();
    render(
      <QuoteBuilder open onClose={() => {}} customerId={1} customer={CUSTOMER} onSaved={() => {}} />
    );
    const first = await screen.findByLabelText(/^item 1$/i);
    await user.type(first, 'Custom flashing');
    expect(first).toHaveValue('Custom flashing');
    expect(screen.queryByLabelText(/add from catalogue/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/remove line 1/i)).toHaveClass('text-red-500');
    await user.click(screen.getByRole('button', { name: /add line/i }));
    expect(screen.getByLabelText(/^item 2$/i)).toBeInTheDocument();
  });

  it('lists Settings VAT rates on each scope line', async () => {
    const user = userEvent.setup();
    render(
      <QuoteBuilder open onClose={() => {}} customerId={1} customer={CUSTOMER} onSaved={() => {}} />
    );
    await screen.findByLabelText(/^item 1$/i);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/quotes/meta/options');
    });
    await user.click(screen.getByLabelText(/^vat 1$/i));
    expect(await screen.findByRole('option', { name: /high 50%/i })).toBeInTheDocument();
  });
});
