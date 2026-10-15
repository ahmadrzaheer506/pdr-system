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
    <div className="flex w-full min-w-0 flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
      {showPills && <ReportRangePills value={preset} onChange={onPreset} />}
      <div className="grid min-w-0 grid-cols-1 gap-3 min-[400px]:grid-cols-2 lg:flex lg:items-end">
        <div className="min-w-0">
          <label className="label" htmlFor="report-from">From</label>
          <DatePicker
            id="report-from"
            className="w-full lg:w-40"
            label="From"
            value={from}
            onChange={onFrom}
          />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="report-to">To</label>
          <DatePicker
            id="report-to"
            className="w-full lg:w-40"
            label="To"
            value={to}
            onChange={onTo}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
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
    </div>
  );
}
