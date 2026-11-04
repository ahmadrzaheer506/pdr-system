'use strict';

const { Op } = require('sequelize');
const { Customer, Lead, User } = require('./models');
const { plain } = require('./db');
const { publicAssignees } = require('./taskAssignees');

const ASSIGNEE_INCLUDE = {
  model: User,
  as: 'assignees',
  attributes: ['id', 'name', 'role'],
  through: { attributes: [] },
};

async function namesByCustomerId(ids) {
  const unique = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!unique.length) return new Map();
  const rows = await Customer.findAll({
    where: { id: { [Op.in]: unique } },
    attributes: ['id', 'name'],
  });
  return new Map(plain(rows).map((c) => [Number(c.id), c.name]));
}

async function enquiriesById(ids) {
  const unique = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!unique.length) return new Map();
  const rows = await Lead.findAll({
    where: { id: { [Op.in]: unique } },
    attributes: ['id', 'customer_id', 'ref'],
  });
  return new Map(plain(rows).map((row) => [Number(row.id), row]));
}

function decorateTask(row, { customerNames = new Map(), enquiries = new Map() } = {}) {
  const o = plain(row);
  const assignees = publicAssignees(o.assignees);
  o.assignees = assignees;
  o.assignee_ids = assignees.map((a) => a.id);
  o.assignee_name = assignees.map((a) => a.name).join(', ') || o.assignee?.name || null;
  if (o.entity_type === 'lead') {
    const enquiry = enquiries.get(Number(o.entity_id));
    o.enquiry_id = o.entity_id;
    o.lead_id = enquiry?.customer_id || null;
    const customerName = o.lead_id ? (customerNames.get(Number(o.lead_id)) || null) : null;
    o.lead_ref = enquiry?.ref || null;
    o.lead_name = enquiry?.ref && customerName ? `${enquiry.ref} - ${customerName}` : customerName;
  } else if (o.entity_type === 'customer') {
    o.enquiry_id = null;
    o.lead_id = o.entity_id;
    o.lead_name = o.lead_id ? (customerNames.get(Number(o.lead_id)) || null) : null;
  } else {
    o.enquiry_id = null;
    o.lead_id = null;
    o.lead_name = null;
  }
  delete o.assignee;
  return o;
}

async function decorateTasks(rows) {
  const list = rows || [];
  const customerIds = [];
  const enquiryIds = [];
  for (const row of list) {
    const o = plain(row);
    if (o.entity_type === 'lead' && o.entity_id) enquiryIds.push(o.entity_id);
    if (o.entity_type === 'customer' && o.entity_id) customerIds.push(o.entity_id);
  }
  const enquiries = await enquiriesById(enquiryIds);
  for (const enquiry of enquiries.values()) {
    if (enquiry.customer_id) customerIds.push(enquiry.customer_id);
  }
  const customerNames = await namesByCustomerId(customerIds);
  return list.map((row) => decorateTask(row, { customerNames, enquiries }));
}

module.exports = { ASSIGNEE_INCLUDE, decorateTask, decorateTasks };
