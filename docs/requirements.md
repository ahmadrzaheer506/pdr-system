### 1. Access & Identity (ACC)
1.1 Current DB setup is sqlite, Change DB setup to postgresql and write proper migrations, we are gonna use sequelize as ORM.

1.2 Email and password authentication.

1.3 Secure session management using httpOnly cookies.

1.4 Three-role model comprising Director, Office, and Operative.

1.5 Route-level role enforcement and structural financial data exclusion for operatives.

1.6 Per-user configurable financial restrictions for office users.

1.7 User lifecycle management (creation, editing, deactivation, password reset).

1.8 Operative skill profiles, driver flags, and director-only pay/cost rates.

1.9 Security audit logging and forced logouts on role changes.

### 2. Customers (CRM)
2.1 Customer master records supporting domestic and commercial types.

2.2 Management of multiple site addresses, contact numbers, and email addresses.

2.3 Unified activity timelines tracking messages, calls, notes, quotes, jobs, and invoices.

2.4 Internal-only notes, photo/document attachments, and linked records.

2.5 Duplicate detection, phone number normalisation, and advanced search/filtering.

2.6 Source attribution, lost reasons, commercial company details, and CSV customer imports.

### 3. Enquiry Inbox (INB)
3.1 Unified inbox aggregating enquiries from multiple channels.

3.2 Inbound capture for WhatsApp, Facebook Page messages, Lead Ad forms, and emails.

3.3 Manual enquiry quick-add for phone calls.

3.4 Automatic customer matching, deduplication, and required next-action fields.

3.5 Enquiry status tracking, direct channel replies, tagging, and ageing indicators.

### 4. Pipeline (PIP)
4.1 Visual Kanban board with an 11-stage sales pipeline.

4.2 Drag-and-drop stage movement with a full transition audit trail.

4.3 Automatic stage progression triggered by system events.

4.4 Filtering options by source, owner, date, and value.

4.5 Pipeline value calculations and stalled-deal indicators.

### 5. Appointments (APT)
5.1 Site visit booking linked to customer records.

5.2 Two-way Google Calendar synchronization and automatic stage/task progression.

5.3 Appointment rescheduling, cancellation handling, and type categorisation.

### 6. Quoting (QUO)
6.1 Quotation builder utilizing catalogue-driven line items and measured quantities.

6.2 Roof area calculation with pitch factors.

6.3 UK tax compliance including per-line VAT, CIS deductions, and reverse charge treatments.

6.4 Commercial terms such as retention, staged payments, and provisional sums.

6.5 Multi-option quotes, optional extras, inclusions, exclusions, and guarantee terms.

6.6 Branded PDF generation with statutory cancellation notices.

6.7 Distribution via WhatsApp and email with digital or manual acceptance tracking.

### 7. Jobs (JOB)
7.1 Automated job creation upon quote acceptance carrying inherited scope.

7.2 Job status lifecycles, multi-day scheduling, and crew skill-matching.

7.3 Materials lists with tracking and templated job checklists.

7.4 Photo capture (before/during/after), document attachments, and progress notes.

7.5 Per-job chat threads, site access notes, and variation management.

### 8. Scheduling (SCH)
8.1 Week and day view schedule boards with unscheduled job queues.

8.2 Crew assignment, availability overlays, and double-booking prevention.

8.3 Skill warnings, driver allocations, and change notifications.

### 9. Timesheets (TIM)
9.1 Job-specific clock-in/clock-out functionality with single active shift enforcement.

9.2 Location capture, distance-from-site flags, and break tracking.

9.3 Live "on the clock" management boards.

9.4 Timesheet review, batch approval, office corrections with reasons, and payroll CSV exports.

### 10. Holidays (HOL)
10.1 Operative holiday requests with server-enforced minimum notice rules.

10.2 Approval and decline workflows with reason capture.

10.3 Annual allowance tracking and integration with team calendars and scheduling.

### 11. Invoicing (INV)
11.1 Invoice generation from completed jobs carrying quoted lines and variations.

11.2 Consistent UK VAT and CIS deductions.

11.3 Branded invoice PDFs sent via email.

11.4 Payment status tracking, manual payment logging, overdue detection, and balance reporting.

### 12. Automation (AUT)
12.1 Configurable quote follow-up sequences with automated halts on customer replies.

12.2 Automated system task generation for follow-ups, quotes, and overdue payments.

12.3 Task list views (due, overdue, today) and scheduled execution.

### 13. Notifications (NOT)
13.1 In-app notification centre and email alerts for critical business events.

13.2 Per-user preference management and unread badge counters.

### 14. Reporting (REP)
14.1 Management dashboards covering lead volume, win/loss rates, and pipeline value.

14.2 Date range filtering and CSV exports for all reports.

14.3 Job profitability and labour analysis restricted to the Director role.

### 15. Assistants (AI)
15.1 Browser-based voice capture and speech-to-text transcription.

15.2 AI-assisted quotation wording and catalogue item suggestions.

15.3 Voice-driven schedule proposals with strict server-side constraint validation.

15.4 Human review and approval gates before committing changes.

### 16. Integrations (INT)
16.1 WhatsApp Business Platform integration (inbound/outbound with templates).

16.2 Meta Graph API support for Facebook messages and Lead Ads.

16.3 Google Calendar OAuth synchronization.

16.4 SMTP email handling, webhook verification, and simulated modes for offline testing.

### 17. Settings (SET)
17.1 Company profile configuration, tax settings (VAT/CIS), and bank details.

17.2 Service catalogue management, template configurations (quotes, messages, checklists).

17.3 Timesheet rules, holiday allowances, user permissions, and branding options.