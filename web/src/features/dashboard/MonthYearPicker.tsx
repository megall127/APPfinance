import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MONTHS_PT } from '@/lib/format'

interface MonthYearPickerProps {
  year: number
  /** 1-based month (1 = Jan, 12 = Dec) */
  month: number
  onYearChange: (year: number) => void
  /** Called with a 1-based month value */
  onMonthChange: (month: number) => void
}

export function MonthYearPicker({
  year,
  month,
  onYearChange,
  onMonthChange,
}: MonthYearPickerProps) {
  const currentYear = new Date().getFullYear()
  const years: number[] = []
  for (let y = 2023; y <= currentYear + 1; y++) {
    years.push(y)
  }

  return (
    <div className="flex gap-2 items-center">
      {/* Month selector — MONTHS_PT is 0-indexed, value is 1-based */}
      <Select
        value={String(month)}
        onValueChange={(v) => onMonthChange(Number(v))}
      >
        <SelectTrigger className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MONTHS_PT.map((label, i) => (
            <SelectItem key={i + 1} value={String(i + 1)}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Year selector */}
      <Select
        value={String(year)}
        onValueChange={(v) => onYearChange(Number(v))}
      >
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
