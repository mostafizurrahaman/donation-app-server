/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import {
  IAnalyticsPeriod,
  TTimeFilter,
} from '../modules/Donation/donation.interface';

/**
 * Calculate percentage change between current and previous values
 */
export const calculatePercentageChange = (
  current: number,
  previous: number
): { percentageChange: number; isIncrease: boolean } => {
  if (previous === 0) {
    return {
      percentageChange: current > 0 ? 100 : 0,
      isIncrease: current > 0,
    };
  }

  const change = ((current - previous) / previous) * 100;
  return {
    percentageChange: Math.abs(parseFloat(change.toFixed(2))),
    isIncrease: change >= 0,
  };
};

/**
 * Get date ranges based on filter (current and previous period)
 */
export const getDateRanges = (
  filter: TTimeFilter,
  year?: number
): { current: IAnalyticsPeriod; previous: IAnalyticsPeriod } => {
  const now = new Date();
  let currentStart: Date,
    currentEnd: Date,
    previousStart: Date,
    previousEnd: Date;

  switch (filter) {
    case 'today':
      currentStart = new Date(now);
      currentStart.setHours(0, 0, 0, 0);
      currentEnd = new Date(now);
      currentEnd.setHours(23, 59, 59, 999);

      previousStart = new Date(currentStart);
      previousStart.setDate(currentStart.getDate() - 1);
      previousEnd = new Date(currentEnd);
      previousEnd.setDate(currentEnd.getDate() - 1);
      break;

    case 'yesterday':
      currentStart = new Date(now);
      currentStart.setDate(currentStart.getDate() - 1);
      currentStart.setHours(0, 0, 0, 0);

      currentEnd = new Date(now);
      currentEnd.setDate(currentEnd.getDate() - 1);
      currentEnd.setHours(23, 59, 59, 999);

      previousStart = new Date(currentStart);
      previousStart.setDate(currentStart.getDate() - 1);
      previousEnd = new Date(currentEnd);
      previousEnd.setDate(currentEnd.getDate() - 1);
      break;

    case 'this_week': {
      const startOfWeek = new Date(now);
      const day = startOfWeek.getDay(); // 0 (Sun) to 6 (Sat)
      // Adjust to get Monday as start of week
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);

      currentStart = new Date(startOfWeek.setDate(diff));
      currentStart.setHours(0, 0, 0, 0);

      currentEnd = new Date(now);
      currentEnd.setHours(23, 59, 59, 999);

      // Previous period: The week before this week
      previousEnd = new Date(currentStart);
      previousEnd.setMilliseconds(-1); // End of previous week

      previousStart = new Date(previousEnd);
      previousStart.setDate(previousStart.getDate() - 6);
      previousStart.setHours(0, 0, 0, 0);
      break;
    }

    case 'last_week': {
      const startOfThisWeek = new Date(now);
      const day = startOfThisWeek.getDay();
      const diff = startOfThisWeek.getDate() - day + (day === 0 ? -6 : 1);

      // Start of last week is 7 days before start of this week
      currentStart = new Date(startOfThisWeek.setDate(diff - 7));
      currentStart.setHours(0, 0, 0, 0);

      currentEnd = new Date(currentStart);
      currentEnd.setDate(currentEnd.getDate() + 6);
      currentEnd.setHours(23, 59, 59, 999);

      // Previous period: The week before last week
      previousStart = new Date(currentStart);
      previousStart.setDate(previousStart.getDate() - 7);

      previousEnd = new Date(currentEnd);
      previousEnd.setDate(previousEnd.getDate() - 7);
      break;
    }

    case 'this_month': {
      const currentYear = year || now.getFullYear();
      const currentMonth = now.getMonth();

      currentStart = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0);
      currentEnd = new Date(now); // Up to right now
      currentEnd.setHours(23, 59, 59, 999);

      // Previous: Last month
      previousStart = new Date(currentYear, currentMonth - 1, 1, 0, 0, 0, 0);
      previousEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
      break;
    }

    case 'last_month': {
      const currentYear = year || now.getFullYear();
      const currentMonth = now.getMonth();

      // Month is 0-indexed. Last month is currentMonth - 1
      currentStart = new Date(currentYear, currentMonth - 1, 1, 0, 0, 0, 0);
      // Day 0 of current month gives last day of previous month
      currentEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

      // Previous: The month before last
      previousStart = new Date(currentYear, currentMonth - 2, 1, 0, 0, 0, 0);
      previousEnd = new Date(currentYear, currentMonth - 1, 0, 23, 59, 59, 999);
      break;
    }

    case 'this_year': {
      const currentYearVal = year || now.getFullYear();

      currentStart = new Date(currentYearVal, 0, 1, 0, 0, 0, 0); // Jan 1st
      currentEnd = new Date(now); // Up to now
      currentEnd.setHours(23, 59, 59, 999);

      // Previous: Last year
      previousStart = new Date(currentYearVal - 1, 0, 1, 0, 0, 0, 0);
      previousEnd = new Date(currentYearVal - 1, 11, 31, 23, 59, 59, 999);
      break;
    }

    case 'last_year': {
      const currentYearVal = year || now.getFullYear();

      currentStart = new Date(currentYearVal - 1, 0, 1, 0, 0, 0, 0); // Jan 1st last year
      currentEnd = new Date(currentYearVal - 1, 11, 31, 23, 59, 59, 999); // Dec 31st last year

      // Previous: Year before last
      previousStart = new Date(currentYearVal - 2, 0, 1, 0, 0, 0, 0);
      previousEnd = new Date(currentYearVal - 2, 11, 31, 23, 59, 59, 999);
      break;
    }

    case 'last_7_days': {
      // Current: Last 7 days including today
      currentEnd = new Date(now);
      currentEnd.setHours(23, 59, 59, 999);

      currentStart = new Date(now);
      currentStart.setDate(currentStart.getDate() - 6); // 7 days window
      currentStart.setHours(0, 0, 0, 0);

      // Previous: The 7 days before the current 7-day window
      previousEnd = new Date(currentStart);
      previousEnd.setMilliseconds(-1); // End of the day before currentStart

      previousStart = new Date(previousEnd);
      previousStart.setDate(previousStart.getDate() - 6);
      previousStart.setHours(0, 0, 0, 0);

      break;
    }
    case 'last_30_days': {
      // Current: Last 30 days including today
      currentEnd = new Date(now);
      currentEnd.setHours(23, 59, 59, 999);

      currentStart = new Date(now);
      currentStart.setDate(currentStart.getDate() - 29); // 30-day window
      currentStart.setHours(0, 0, 0, 0);

      // Previous: The 30 days before the current 30-day window
      previousEnd = new Date(currentStart);
      previousEnd.setMilliseconds(-1); // End of the day before currentStart

      previousStart = new Date(previousEnd);
      previousStart.setDate(previousStart.getDate() - 29);
      previousStart.setHours(0, 0, 0, 0);

      break;
    }

    default:
      // Default to today if invalid
      currentStart = new Date(now.setHours(0, 0, 0, 0));
      currentEnd = new Date(now.setHours(23, 59, 59, 999));
      previousStart = new Date(currentStart);
      previousStart.setDate(previousStart.getDate() - 1);
      previousEnd = new Date(currentEnd);
      previousEnd.setDate(previousEnd.getDate() - 1);
  }

  return {
    current: { startDate: currentStart, endDate: currentEnd },
    previous: { startDate: previousStart, endDate: previousEnd },
  };
};

/**
 * Validate filter parameter
 */
export const isValidFilter = (filter: string): filter is TTimeFilter => {
  return [
    'today',
    'yesterday',
    'this_week',
    'last_week',
    'this_month',
    'last_month',
    'this_year',
    'last_year',
    'last_7_days',
    'last_30_days',
  ].includes(filter);
};

/**
 * Build base query for donation aggregation
 */
export const buildBaseQuery = (
  organizationId?: string,
  donationType?: string
): Record<string, any> => {
  const query: any = { status: 'completed' };
  if (organizationId) {
    query.organization = new Types.ObjectId(organizationId);
  }
  if (donationType) {
    query.donationType = donationType;
  }
  return query;
};

/**
 * Format currency value to 2 decimal places
 */
export const formatCurrency = (value: number): number => {
  return parseFloat(value.toFixed(2));
};

/**
 * Get period label for display
 */
/**
 * Get period label for display
 */
export const getPeriodLabel = (
  filter: TTimeFilter
): { current: string; previous: string } => {
  const labels: Record<TTimeFilter, { current: string; previous: string }> = {
    today: { current: 'Today', previous: 'Yesterday' },
    yesterday: { current: 'Yesterday', previous: 'Day Before Yesterday' },
    this_week: { current: 'This Week', previous: 'Last Week' },
    last_week: { current: 'Last Week', previous: '2 Weeks Ago' },
    this_month: { current: 'This Month', previous: 'Last Month' },
    last_month: { current: 'Last Month', previous: '2 Months Ago' },
    this_year: { current: 'This Year', previous: 'Last Year' },
    last_year: { current: 'Last Year', previous: '2 Years Ago' },
    last_7_days: { current: 'Last 7 Days', previous: 'Last 7 Days' },
    last_30_days: { current: 'Last 30 Days', previous: 'Last 30 Days' },
  };

  return labels[filter];
};

// Helper to calculate streaks
export const calculateStreaks = (dates: Date[]) => {
  if (dates.length === 0) return { maxStreak: 0, currentStreak: 0 };

  // Sort dates descending (newest first)
  // Normalize to string YYYY-MM-DD to ignore times
  const uniqueSortedDates = Array.from(
    new Set(dates.map((d) => d.toISOString().split('T')[0]))
  )
    .sort()
    .reverse();

  let maxStreak = 0;
  let currentStreak = 0;
  let tempStreak = 1;

  // Check current streak (consecutive days from today/yesterday)
  const todayStr = new Date().toISOString().split('T')[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (
    uniqueSortedDates.includes(todayStr) ||
    uniqueSortedDates.includes(yesterdayStr)
  ) {
    currentStreak = 1;

    for (let i = 0; i < uniqueSortedDates.length - 1; i++) {
      const curr = new Date(uniqueSortedDates[i]);
      const prev = new Date(uniqueSortedDates[i + 1]);

      // Calculate difference in days
      const diffTime = Math.abs(curr.getTime() - prev.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  // Calculate Max Streak (Consistency) anywhere in the array
  // Re-sort ascending for easier loop
  const ascDates = [...uniqueSortedDates].reverse();
  if (ascDates.length > 0) maxStreak = 1;

  for (let i = 0; i < ascDates.length - 1; i++) {
    const curr = new Date(ascDates[i]);
    const next = new Date(ascDates[i + 1]);

    const diffTime = Math.abs(next.getTime() - curr.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      tempStreak++;
    } else {
      if (tempStreak > maxStreak) maxStreak = tempStreak;
      tempStreak = 1;
    }
  }
  if (tempStreak > maxStreak) maxStreak = tempStreak;

  return { maxStreak, currentStreak };
};

export const getRecurringLabel = (donation: any) => {
  const { frequency, customInterval, startDate } = donation;
  const start = new Date(startDate);

  // Format time in AM/PM
  const hours = start.getHours();
  const minutes = start.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const time = `${hour12}:${minutes} ${ampm}`;

  const daysOfWeek = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  const dayName = daysOfWeek[start.getDay()];

  switch (frequency) {
    case 'daily':
      return `Every day at ${time}`;

    case 'weekly':
      return `Every ${dayName} at ${time}`;

    case 'monthly':
      const dayOfMonth = start.getDate();
      return `Every month on the ${dayOfMonth}${getOrdinal(
        dayOfMonth
      )} at ${time}`;

    case 'yearly':
      const month = start.toLocaleString('default', { month: 'long' });
      const day = start.getDate();
      return `Every year on ${month} ${day}${getOrdinal(day)} at ${time}`;

    case 'custom':
      if (!customInterval) return 'Custom schedule';

      const { unit, value } = customInterval;

      if (unit === 'days') {
        return `Every ${value} day(s) at ${time}`;
      }

      if (unit === 'weeks') {
        return `Every ${value} week(s) on ${dayName} at ${time}`;
      }

      if (unit === 'months') {
        const dayCustom = start.getDate();
        return `Every ${value} month(s) on the ${dayCustom}${getOrdinal(
          dayCustom
        )} at ${time}`;
      }

      if (unit === 'years') {
        const monthCustom = start.toLocaleString('default', { month: 'long' });
        const dayCustom = start.getDate();
        return `Every ${value} year(s) on ${monthCustom} ${dayCustom}${getOrdinal(
          dayCustom
        )} at ${time}`;
      }

      return 'Custom schedule';

    default:
      return 'Unknown schedule';
  }
};

// Helper to get ordinal (1st, 2nd, 3rd…)
export const getOrdinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};

// 5. Get all transaction of client:
export const getTimeAgo = (date: Date): string => {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - new Date(date).getTime()) / 1000);

  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + ' years ago';

  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + ' months ago';

  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + ' days ago';

  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + ' hours ago';

  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + ' minutes ago';

  return Math.floor(seconds) + ' seconds ago';
};

// Helper to format Date Header
export const getDateHeader = (date: Date): string => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const d = new Date(date);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return d.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};
