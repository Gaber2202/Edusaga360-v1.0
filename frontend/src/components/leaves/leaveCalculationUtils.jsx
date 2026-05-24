import { eachDayOfInterval, isWeekend } from 'date-fns';

export const calculateDeductibleDays = (startDate, endDate, holidays = []) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const allDays = eachDayOfInterval({ start, end });
  
  const holidayDates = holidays
    .filter(h => new Date(h.start_date) <= end && new Date(h.end_date) >= start)
    .flatMap(h => eachDayOfInterval({ start: new Date(h.start_date), end: new Date(h.end_date) }))
    .map(d => d.toISOString().split('T')[0]);

  const overlappingHolidays = holidays.filter(
    h => new Date(h.start_date) <= end && new Date(h.end_date) >= start
  );

  const deductibleDays = allDays.filter(day => {
    const dayStr = day.toISOString().split('T')[0];
    return !holidayDates.includes(dayStr) && !isWeekend(day);
  }).length;

  return { deductibleDays, overlappingHolidays, totalDays: allDays.length };
};

export const getLeaveBalance = (leaveBalance, _leaveType) => {
  if (!leaveBalance) return 0;
  return leaveBalance.remaining_days || 0;
};

export const canApplyUnpaidLeave = (deductibleDays, availableBalance) => {
  return deductibleDays > availableBalance;
};

export const calculateBalanceAfter = (currentBalance, deductibleDays, isUnpaid) => {
  if (isUnpaid) return currentBalance;
  return Math.max(0, currentBalance - deductibleDays);
};