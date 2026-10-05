import React from 'react';
import ReportRangePills from './ReportRangePills.jsx';
import DatePicker from './DatePicker.jsx';

/**
 * 7/30/90 plus optional from/to. When both dates are set they override the pills (requirement 14.2).
 */
export default function ReportRangeControls({
  preset,
  from,
  to,
  onPreset,
  onFrom,
  onTo,
  showPills = true,
  onGenerate,
  generating = false,
  onDownload,
  downloadDisabled = false,
  downloading = false,
  downloadLabel = 'Download CSV',
  extraButtons = null,
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {showPills && <ReportRangePills value={preset} onChange={onPreset} />}
      <div>
        <label className="label" htmlFor="report-from">From</label>
        <DatePicker
          id="report-from"
          className="w-40"
          label="From"
          value={from}
          onChange={onFrom}
        />
      </div>
      <div>
        <label className="label" htmlFor="report-to">To</label>
        <DatePicker
          id="report-to"
          className="w-40"
          label="To"
          value={to}
          onChange={onTo}
        />
      </div>
      {onGenerate && (
        <button type="button" className="btn-primary" disabled={generating} onClick={onGenerate}>
          {generating ? 'Generating…' : 'Generate'}
        </button>
      )}
      {onDownload && (
        <button type="button" className="btn-secondary" disabled={downloadDisabled || downloading} onClick={onDownload}>
          {downloading ? 'Downloading…' : downloadLabel}
        </button>
      )}
      {extraButtons}
    </div>
  );
}
