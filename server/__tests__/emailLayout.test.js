const {
  BRAND_RED,
  escapeHtml,
  firstHttpUrl,
  renderBrandedEmail,
} = require('../emailLayout');

describe('branded email layout', () => {
  test('wraps inner copy in header, brand colour, and footer', () => {
    const { html, text } = renderBrandedEmail({
      subject: 'Your quotation Q-4',
      payload: 'Hi Dave,\n\nPlease find attached quotation Q-4.',
      company: {
        name: 'Paul Douglas Roofing and Building Ltd',
        address: 'Unit 4, Trade Park, Roofers Lane',
        city: 'United Kingdom',
        phone: '01234 567890',
        email: 'office@pauldouglasroofing.co.uk',
      },
      logoSrc: 'cid:pdr-logo',
    });
    expect(html).toContain('cid:pdr-logo');
    expect(html).toContain(BRAND_RED);
    expect(html).toContain('Your quotation Q-4');
    expect(html).toContain('Please find attached quotation Q-4.');
    expect(html).toContain('Paul Douglas Roofing and Building Ltd');
    expect(html).toContain('Unit 4, Trade Park, Roofers Lane');
    expect(html).toContain('01234 567890');
    expect(text).toContain('Please find attached quotation Q-4.');
    expect(text).toContain('Paul Douglas Roofing and Building Ltd');
  });

  test('renders a CTA button for structured password-reset copy', () => {
    const { html, text } = renderBrandedEmail({
      subject: 'Reset your password',
      payload: {
        greeting: 'Hi Paul,',
        body: 'We received a request to reset your Paul Douglas Roofing password. This link is valid for 1 hour.',
        actionUrl: 'http://localhost:5173/reset-password?token=abc',
        actionLabel: 'Reset password',
        note: 'If you did not ask for this, you can ignore this email.',
      },
      logoSrc: 'cid:pdr-logo',
    });
    expect(html).toContain('Hi Paul,');
    expect(html).toContain('Reset password');
    expect(html).toContain('href="http://localhost:5173/reset-password?token=abc"');
    expect(html).toContain('If you did not ask for this');
    expect(text).toContain('http://localhost:5173/reset-password?token=abc');
  });

  test('auto-detects a reset link in plaintext payloads', () => {
    const { html } = renderBrandedEmail({
      subject: 'Reset your password',
      payload: 'Hi ddd,\n\nReset using this link:\nhttp://localhost:5173/reset-password?token=xyz',
    });
    expect(html).toContain('Reset password');
    expect(html).toContain('href="http://localhost:5173/reset-password?token=xyz"');
  });

  test('escapes HTML in user-supplied copy', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    const { html } = renderBrandedEmail({
      subject: 'Hi',
      payload: '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  test('firstHttpUrl picks the reset link', () => {
    expect(firstHttpUrl('see http://localhost:5173/reset-password?token=1 now')).toContain('/reset-password?token=1');
  });
});
