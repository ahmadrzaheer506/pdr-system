import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import WebsiteEnquiryDetails from './WebsiteEnquiryDetails.jsx';

describe('WebsiteEnquiryDetails', () => {
  it('keeps Details on its own row, not beside Heard about us', () => {
    render(
      <WebsiteEnquiryDetails
        hidePlace
        lead={{
          source: 'website',
          message: 'This is developer testing,',
          meta: {
            external_ref: 'ENQ-261020-83U7',
            service: 'Fascias, Soffits & Guttering',
            property_type: 'House',
            roof_type: 'Pitched, slate',
            urgency: 'Emergency',
            contact_pref: 'Call',
            best_time: 'Afternoon',
            heard_from: 'Recommendation',
            photo_count: 3,
            enquiry_message: 'This is developer testing,',
          },
        }}
      />,
    );
    const details = screen.getByText('Details');
    const heard = screen.getByText('Heard about us');
    expect(details.closest('dl')).not.toBe(heard.closest('dl'));
    expect(screen.getByText('This is developer testing,')).toBeInTheDocument();
    expect(screen.getByText('ENQ-261020-83U7')).toBeInTheDocument();
    expect(screen.getByText('Fascias, Soffits & Guttering')).toBeInTheDocument();
  });
});
