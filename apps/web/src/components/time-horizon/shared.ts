/**
 * Types and view constants shared by the time-horizon orchestrator and its
 * four views. The day-key helpers are re-exported from lib/time-horizon so a
 * view has one import site for everything it needs.
 */
import type { MemoStatsResponse } from "@/api";

export type TimeHorizonTab = "year" | "month" | "week" | "day";
export type DisplayMode = "calendar" | "heatmap";

export type FlareMoTimeHorizonProps = {
  stats: MemoStatsResponse;
  streak: number;
  monthLabels: Array<{ date: string; label: string }>;
  onDaySelect?: (day: string) => void;
  onNavigate?: () => void;
  hoveredDate?: string | null;
  onHoverDate?: (date: string | null) => void;
  className?: string;
};

export { parseDayKey, yearOf } from "@/lib/time-horizon";

export const MONTH_SHORT_NAMES = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
] as const;

// 4 Time Periods for Day Horizon View (6 hours each)
export const DAY_PERIODS = [
  { label: "夜间", range: "00-06", hours: [0, 1, 2, 3, 4, 5] },
  { label: "早晨", range: "06-12", hours: [6, 7, 8, 9, 10, 11] },
  { label: "下午", range: "12-18", hours: [12, 13, 14, 15, 16, 17] },
  { label: "晚间", range: "18-24", hours: [18, 19, 20, 21, 22, 23] },
] as const;

export const DAY_HOURS = Array.from({ length: 24 }, (_, i) => i);

// Backward-compat aliases if needed
export const DAY_COLUMN_HOURS = [
  [0, 1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10, 11],
  [12, 13, 14, 15, 16, 17],
  [18, 19, 20, 21, 22, 23],
] as const;

export const DAY_COLUMN_LABELS = [
  "夜间 (00-06)",
  "上午 (06-12)",
  "下午 (12-18)",
  "晚上 (18-24)",
] as const;
