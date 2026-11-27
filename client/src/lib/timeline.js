/** Timeline types from requirement 2.3. */
export const TIMELINE_TYPES = ['message', 'call', 'note', 'quote', 'job', 'invoice'];

export const TIMELINE_LABELS = {
  message: 'Message',
  call: 'Call',
  note: 'Note',
  quote: 'Quote',
  job: 'Job',
  invoice: 'Invoice',
};

export const CHANNEL_LABELS = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  website: 'Website',
  facebook: 'Facebook',
  phone: 'Call',
  sms: 'SMS',
  note: 'Note',
};

/** Channel name on conversation bubbles (WhatsApp / Email), else the timeline type. */
export function timelineChannelLabel(item) {
  const channel = item?.meta?.channel;
  if (channel && CHANNEL_LABELS[channel]) return CHANNEL_LABELS[channel];
  return TIMELINE_LABELS[item?.type] || 'Message';
}

export function timelineStatusLabel(status) {
  if (status === 'sent') return 'Sent';
  if (status === 'failed' || status === 'error') return 'Failed';
  if (status === 'simulated') return 'Not delivered';
  if (status === 'received') return 'Received';
  if (status === 'logged') return 'Logged';
  return null;
}
