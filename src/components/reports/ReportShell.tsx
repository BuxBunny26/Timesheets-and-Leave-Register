import type { ReactNode } from 'react'
import { IconDownload, IconPrinter } from '../Icons'

interface Props {
  title: string
  subtitle?: string
  onExcel?: () => void
  onPrint?: () => void
  loading?: boolean
  children: ReactNode
  reportId?: string
}

export default function ReportShell({ title, subtitle, onExcel, onPrint, loading, children, reportId }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-100">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {onExcel && (
            <button
              onClick={onExcel}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
            >
              <IconDownload className="w-3.5 h-3.5" /> Excel
            </button>
          )}
          {onPrint && (
            <button
              onClick={onPrint}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              <IconPrinter className="w-3.5 h-3.5" /> Print
            </button>
          )}
        </div>
      </div>
      <div id={reportId} className="p-5">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#1B5EA6]" />
          </div>
        ) : children}
      </div>
    </div>
  )
}
