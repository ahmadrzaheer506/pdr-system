import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, MapPin, User } from 'lucide-react';
import { api } from '../lib/api';
import { Avatar, PageLoading, LoadError, useToast, Toast } from '../components/ui.jsx';
import CustomerContacts from '../components/CustomerContacts.jsx';
import CustomerEditForm from '../components/CustomerEditForm.jsx';
import LeadCard from '../components/LeadCard.jsx';
import { formatSite, primaryOf } from '../lib/contacts.js';
import { leadPath } from '../lib/customerRoutes.js';

function MetaChip({ icon: Icon, children, href }) {
  const className = 'inline-flex max-w-full items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600';
  const inner = (
    <>
      <Icon size={12} className="shrink-0 text-slate-400" />
      <span className="truncate">{children}</span>
    </>
  );
  if (href) {
    return <a href={href} className={`${className} hover:bg-slate-200`}>{inner}</a>;
  }
  return <span className={className}>{inner}</span>;
}

export default function CustomerRecord() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const { toast, show } = useToast();

  const load = useCallback(() => api.get(`/customers/${id}`).then(setData).catch((err) => {
    show(err.message, 'error');
    setData((current) => (current && current.customer ? current : { error: err.message || 'Could not load this customer' }));
  }), [id, show]);

  useEffect(() => { load(); }, [load]);

  if (params.get('from') === 'inbox') {
    return <Navigate to={leadPath(id, 'inbox')} replace />;
  }

  if (!data) return <PageLoading />;
  if (!data.customer) return <LoadError message={data.error || 'Customer not found'} />;

  const { customer } = data;
  const leads = data.leads || [];
  const commercial = customer.customer_type === 'commercial';
  const site = primaryOf(customer.sites);
  const phone = primaryOf(customer.phones);
  const email = primaryOf(customer.emails);

  return (
    <div className="space-y-5">
      <Link to="/customers" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={15} /> Back to customers
      </Link>

      <div className="card !rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <Avatar name={customer.name} size={14} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">{customer.name}</h1>
              <span className={`badge ${commercial ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'}`}>
                {commercial ? 'Commercial' : 'Domestic'}
              </span>
            </div>
            {commercial && customer.company_name && (
              <p className="mt-1 text-sm text-slate-600">{customer.company_name}</p>
            )}
            <p className="text-sm text-slate-500 mt-1">Customer record — details, contacts, and every lead for this person.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <MetaChip icon={User}>{customer.owner_name || 'Unassigned'}</MetaChip>
              {phone && (
                <MetaChip icon={Phone} href={`tel:${phone.value}`}>{phone.value}</MetaChip>
              )}
              {email && (
                <MetaChip icon={Mail} href={`mailto:${email.value}`}>{email.value}</MetaChip>
              )}
              {site && (
                <MetaChip icon={MapPin}>{formatSite(site)}</MetaChip>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card !rounded-2xl p-5 sm:p-6">
        <div className="mb-4">
          <h2 className="font-semibold text-slate-900">Customer details</h2>
          <p className="text-xs text-slate-400 mt-0.5">Who they are, who owns the relationship, and anything the office should know.</p>
        </div>
        <CustomerEditForm
          customer={customer}
          idPrefix="record-customer"
          submitLabel="Update"
          onSaved={() => { load(); show('Customer updated'); }}
          onError={(msg) => show(msg, 'error')}
        />
      </div>

      <CustomerContacts
        customer={customer}
        onChanged={() => { load(); show('Contacts updated'); }}
        onError={(msg) => show(msg, 'error')}
      />

      <div className="card !rounded-2xl p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="font-semibold text-slate-900">Leads</h2>
            <p className="text-xs text-slate-400 mt-0.5">Enquiries linked to this customer.</p>
          </div>
          <span className="text-xs font-medium text-slate-400">{leads.length === 1 ? '1 lead' : `${leads.length} leads`}</span>
        </div>
        {leads.length === 0 ? (
          <p className="text-sm text-slate-400">No leads yet. New inbox enquiries for this customer will appear here.</p>
        ) : (
          <div className="space-y-3">
            {leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={{ ...lead, customer_id: customer.id, customer_name: customer.name }}
                from="customer"
              />
            ))}
          </div>
        )}
      </div>

      <Toast {...toast} />
    </div>
  );
}
