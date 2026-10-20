import { describe, it, expect } from 'vitest';
import { extractEnquiryDetails, websiteEnquiryView } from './websiteEnquiry.js';

describe('websiteEnquiryView', () => {
  it('labels property type and roof type instead of a mashed headline', () => {
    const view = websiteEnquiryView({
      source: 'website',
      address: 'sui gas',
      postcode: 'KD4 3EF',
      message: 'Fascias, Soffits & Guttering · House · Pitched, slate · Emergency\nsui gas, KD4 3EF\n\nThis is developer testing,\n\nPreferred contact: Call\nBest time: Afternoon\nHeard about us: Recommendation\n\nPhotos: 3 attached',
      meta: {
        external_ref: 'ENQ-261020-3M0Z',
        service: 'Fascias, Soffits & Guttering',
        property_type: 'House',
        roof_type: 'Pitched, slate',
        urgency: 'Emergency',
        contact_pref: 'Call',
        best_time: 'Afternoon',
        heard_from: 'Recommendation',
        photo_count: 3,
      },
    });
    expect(view.rows).toEqual([
      { label: 'Website reference', value: 'ENQ-261020-3M0Z' },
      { label: 'Job', value: 'Fascias, Soffits & Guttering' },
      { label: 'Property type', value: 'House' },
      { label: 'Roof type', value: 'Pitched, slate' },
      { label: 'Urgency', value: 'Emergency' },
      { label: 'Address', value: 'sui gas' },
      { label: 'Postcode', value: 'KD4 3EF' },
      { label: 'Photos', value: '3 attached' },
      { label: 'Preferred contact', value: 'Call' },
      { label: 'Best time', value: 'Afternoon' },
      { label: 'Heard about us', value: 'Recommendation' },
    ]);
    expect(view.details).toBe('This is developer testing,');
  });

  it('can omit address and postcode when they already show in the header', () => {
    const view = websiteEnquiryView({
      source: 'website',
      address: 'sui gas',
      postcode: 'KD4 3EF',
      meta: {
        external_ref: 'ENQ-261020-3M0Z',
        service: 'Fascias, Soffits & Guttering',
        property_type: 'House',
        roof_type: 'Pitched, slate',
      },
    }, { hidePlace: true });
    expect(view.rows.map((r) => r.label)).toEqual(['Website reference', 'Job', 'Property type', 'Roof type']);
  });

  it('uses stored enquiry_message when present', () => {
    expect(extractEnquiryDetails({
      meta: { enquiry_message: 'ee ee ee ee ee' },
      message: 'Job: Flat Roofs\n\nDetails\nee ee ee ee ee',
    })).toBe('ee ee ee ee ee');
  });
});
