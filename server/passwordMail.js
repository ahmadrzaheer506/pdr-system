const email = require('./integrations/email');
const { createResetToken, resetLink, spaOrigin } = require('./passwordReset');

/**
 * Store a one-hour reset token and send the branded reset email.
 * @param {import('sequelize').Model} user
 */
async function issueResetEmail(user) {
  const { token, hash, expires } = createResetToken();
  user.password_reset_token = hash;
  user.password_reset_expires = expires;
  await user.save();
  const firstName = String(user.name || 'there').split(' ')[0];
  await email.send(user.email, 'Reset your password', {
    greeting: `Hi ${firstName},`,
    body: 'We received a request to reset your Paul Douglas Roofing password. This link is valid for 1 hour.',
    actionUrl: resetLink(token),
    actionLabel: 'Reset password',
    note: 'If you did not ask for this, you can ignore this email and your password will stay the same.',
  });
}

/**
 * Welcome mail with login email and the temporary password chosen at create.
 */
async function sendWelcomeCredentials({ name, email: to, password }) {
  const firstName = String(name || 'there').split(' ')[0];
  await email.send(to, 'Your Paul Douglas Roofing account', {
    greeting: `Hi ${firstName},`,
    title: 'Your account is ready',
    body: `An administrator created a Paul Douglas Roofing CRM account for you.\n\nEmail: ${to}\nTemporary password: ${password}\n\nSign in with these details, then change your password from your profile.`,
    actionUrl: `${spaOrigin()}/login`,
    actionLabel: 'Sign in',
    note: 'Keep this email private. You can change the password after you sign in.',
  });
}

module.exports = { issueResetEmail, sendWelcomeCredentials };
