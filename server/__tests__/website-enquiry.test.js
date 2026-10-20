const {
  parseWebsiteEnquiry,
  buildBody,
  collectEnquiryPhotos,
  sniffImageMime,
} = require('../services/websiteEnquiry');

const JPEG = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
]);

const SAMPLE = {
  ref: 'ENQ-261020-B11Y',
  received: '20 Oct 2026, 16:52',
  to: 'office@example.com',
  from: 'P Douglas Roofing <noreply@example.com>',
  service: 'Roof Tiling',
  property_type: 'Bungalow',
  roof_type: '',
  urgency: 'Planning',
  postcode: 'FG4 5RT',
  address: 'eeee',
  message: 'rr trt tr rdd',
  source: 'Google',
  first_name: 'Sahil',
  last_name: 'test',
  phone: '07700 900000',
  email: 'test@gmail.com',
  contact_pref: 'Call',
  best_time: 'Afternoon',
  consent: 'yes',
  page: '/contact/',
  photo_count: 1,
  photos: ['logo.png'],
};

describe('website enquiry payload', () => {
  test('accepts the landing-page payload and maps CRM source to website', () => {
    const parsed = parseWebsiteEnquiry(SAMPLE);
    expect(parsed.error).toBeUndefined();
    expect(parsed.value.source).toBe('website');
    expect(parsed.value.name).toBe('Sahil test');
    expect(parsed.value.phone).toBe('07700 900000');
    expect(parsed.value.email).toBe('test@gmail.com');
    expect(parsed.value.address).toBe('eeee');
    expect(parsed.value.postcode).toBe('FG4 5RT');
    expect(parsed.value.forceNewLead).toBe(true);
    expect(parsed.value.meta.heard_from).toBe('Google');
    expect(parsed.value.meta.service).toBe('Roof Tiling');
    expect(parsed.value.meta.external_ref).toBe('ENQ-261020-B11Y');
    expect(parsed.value.enquiry_message).toBe('rr trt tr rdd');
    expect(parsed.value.meta.photo_file_ids).toEqual([]);
    expect(parsed.value.meta.photos).toBeUndefined();
    expect(parsed.value.body).toContain('Job: Roof Tiling');
    expect(parsed.value.body).toContain('Property type: Bungalow');
    expect(parsed.value.body).toContain('rr trt tr rdd');
    expect(parsed.value.body).toContain('Heard about us: Google');
    expect(parsed.value.meta.enquiry_message).toBe('rr trt tr rdd');
  });

  test('requires consent, a name, and a phone or email', () => {
    expect(parseWebsiteEnquiry({ ...SAMPLE, consent: 'no' }).error).toMatch(/consent/i);
    expect(parseWebsiteEnquiry({ ...SAMPLE, first_name: '', last_name: '' }).error).toMatch(/name/i);
    expect(parseWebsiteEnquiry({ ...SAMPLE, phone: '', email: '' }).error).toMatch(/phone or email/i);
  });

  test('buildBody includes optional roof fields', () => {
    const text = buildBody({
      service: 'New Roof',
      property_type: 'House',
      urgency: 'Soon',
      postcode: 'SK3 8AX',
      message: 'Leak above the bedroom',
      contact_pref: 'WhatsApp',
    });
    expect(text).toMatch(/Job: New Roof/);
    expect(text).toMatch(/Property type: House/);
    expect(text).toMatch(/Postcode: SK3 8AX/);
    expect(text).toMatch(/Leak above the bedroom/);
    expect(text).toMatch(/Preferred contact: WhatsApp/);
  });

  test('sniffs jpeg/png and ignores photo URL strings', () => {
    expect(sniffImageMime(JPEG)).toBe('image/jpeg');
    const collected = collectEnquiryPhotos({
      files: [],
      body: {
        photos: [
          'https://your-site.co.uk/uploads/photo1.jpg',
          { filename: 'roof.jpg', mime: 'image/jpeg', data: JPEG.toString('base64') },
        ],
      },
    });
    expect(collected.files).toHaveLength(1);
    expect(collected.files[0].mimetype).toBe('image/jpeg');
    expect(collected.files[0].originalname).toBe('roof.jpg');
  });
});
