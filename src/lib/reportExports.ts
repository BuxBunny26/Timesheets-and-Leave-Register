import * as XLSX from 'xlsx'

export interface ReportRow {
  [key: string]: string | number | null | undefined
}

export function exportToExcel(rows: ReportRow[], filename: string, sheetName = 'Report') {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  // Auto-fit column widths
  const maxWidths: number[] = []
  rows.forEach(row => {
    Object.values(row).forEach((val, i) => {
      const len = String(val ?? '').length
      maxWidths[i] = Math.max(maxWidths[i] ?? 0, len + 2)
    })
  })
  ws['!cols'] = maxWidths.map(w => ({ wch: Math.min(w, 40) }))

  XLSX.writeFile(wb, `${filename}.xlsx`)
}

export function exportPaymentCentreExcel(
  rows: ReportRow[],
  filename: string
) {
  // Group by employee for subtotals
  const employeeGroups: Map<string, ReportRow[]> = new Map()
  for (const row of rows) {
    const key = String(row['Employee Code'] ?? row['Employee Name'] ?? '')
    if (!employeeGroups.has(key)) employeeGroups.set(key, [])
    employeeGroups.get(key)!.push(row)
  }

  const allRows: ReportRow[] = []
  for (const [, empRows] of employeeGroups) {
    allRows.push(...empRows)
    // Subtotal row
    const otTotal = empRows.reduce((s, r) => s + (Number(r['OT Hours']) || 0), 0)
    const lolTotal = empRows.filter(r => r['LOL'] === 'Yes').length
    const loiTotal = empRows.filter(r => r['LOI'] === 'Yes').length
    allRows.push({
      'Employee Name': `SUBTOTAL — ${empRows[0]['Employee Name']}`,
      'Employee Code': '',
      'Division': '',
      'Department': '',
      'Site': '',
      'Date': '',
      'Day': '',
      'Status': '',
      'OT Hours': otTotal || '',
      'LOL': lolTotal || '',
      'LOI': loiTotal || '',
    })
  }

  exportToExcel(allRows, filename, 'Payment Centre')
}

export function printReport(elementId: string) {
  const el = document.getElementById(elementId)
  if (!el) return
  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  printWindow.document.write(`
    <html>
      <head>
        <title>WearCheck ARC — Report</title>
        <style>
          body { font-family: Inter, system-ui, sans-serif; font-size: 12px; color: #111; }
          table { border-collapse: collapse; width: 100%; margin-top: 12px; }
          th { background: #1B5EA6; color: white; padding: 6px 10px; text-align: left; font-size: 11px; }
          td { padding: 5px 10px; border-bottom: 1px solid #e5e7eb; }
          tr:nth-child(even) td { background: #f9fafb; }
          h1 { font-size: 18px; margin-bottom: 4px; }
          p { margin: 2px 0; color: #6b7280; font-size: 11px; }
          .subtotal td { background: #eff6ff !important; font-weight: 600; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>${el.innerHTML}</body>
    </html>
  `)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => { printWindow.print(); printWindow.close() }, 400)
}
