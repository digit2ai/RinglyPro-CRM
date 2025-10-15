/**
 * Natural Language Date/Time Parser
 * Converts phrases like "tomorrow at 2pm", "next Friday at 3:30pm" to Date objects
 */

function parseNaturalDate(text) {
  const now = new Date();
  const lowerText = text.toLowerCase().trim();

  // Time patterns
  const timeMatch = lowerText.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  let hours = 12;
  let minutes = 0;

  if (timeMatch) {
    hours = parseInt(timeMatch[1]);
    minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;

    if (timeMatch[3]) {
      const isPM = timeMatch[3].toLowerCase() === 'pm';
      if (isPM && hours < 12) hours += 12;
      if (!isPM && hours === 12) hours = 0;
    }
  }

  // Date calculations
  let targetDate = new Date(now);

  if (lowerText.includes('today')) {
    // Today at specified time
    targetDate.setHours(hours, minutes, 0, 0);
  }
  else if (lowerText.includes('tomorrow')) {
    // Tomorrow at specified time
    targetDate.setDate(targetDate.getDate() + 1);
    targetDate.setHours(hours, minutes, 0, 0);
  }
  else if (lowerText.includes('next week')) {
    // Next week, same day
    targetDate.setDate(targetDate.getDate() + 7);
    targetDate.setHours(hours, minutes, 0, 0);
  }
  else if (lowerText.match(/in (\d+) (hour|day|week)/)) {
    // "in 2 hours", "in 3 days", "in 1 week"
    const match = lowerText.match(/in (\d+) (hour|day|week)/);
    const amount = parseInt(match[1]);
    const unit = match[2];

    if (unit === 'hour') {
      targetDate.setHours(targetDate.getHours() + amount);
    } else if (unit === 'day') {
      targetDate.setDate(targetDate.getDate() + amount);
      targetDate.setHours(hours, minutes, 0, 0);
    } else if (unit === 'week') {
      targetDate.setDate(targetDate.getDate() + (amount * 7));
      targetDate.setHours(hours, minutes, 0, 0);
    }
  }
  else if (lowerText.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/)) {
    // Next occurrence of day name
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const match = lowerText.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
    const targetDay = days.indexOf(match[1]);
    const currentDay = targetDate.getDay();

    let daysUntilTarget = targetDay - currentDay;
    if (daysUntilTarget <= 0) daysUntilTarget += 7; // Next week if day has passed

    targetDate.setDate(targetDate.getDate() + daysUntilTarget);
    targetDate.setHours(hours, minutes, 0, 0);
  }
  else {
    // Default: today at specified time
    targetDate.setHours(hours, minutes, 0, 0);
  }

  return targetDate;
}

function parseDuration(text) {
  const lowerText = text.toLowerCase();

  // Match patterns like "30 minutes", "1 hour", "90 minutes"
  const minutesMatch = lowerText.match(/(\d+)\s*(?:minute|min)/);
  const hoursMatch = lowerText.match(/(\d+)\s*(?:hour|hr)/);

  let minutes = 30; // Default 30 minutes

  if (minutesMatch) {
    minutes = parseInt(minutesMatch[1]);
  } else if (hoursMatch) {
    minutes = parseInt(hoursMatch[1]) * 60;
  }

  return minutes;
}

function formatDate(date) {
  return date.toISOString();
}

function formatFriendlyDate(date) {
  const options = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  };
  return date.toLocaleDateString('en-US', options);
}

module.exports = {
  parseNaturalDate,
  parseDuration,
  formatDate,
  formatFriendlyDate
};
