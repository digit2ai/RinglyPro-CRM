const businessHours = {
  monday: { start: '09:00', end: '17:00', enabled: true },
  tuesday: { start: '09:00', end: '17:00', enabled: true },
  wednesday: { start: '09:00', end: '17:00', enabled: true },
  thursday: { start: '09:00', end: '17:00', enabled: true },
  friday: { start: '09:00', end: '17:00', enabled: true },
  saturday: { start: '10:00', end: '14:00', enabled: true },
  sunday: { start: '00:00', end: '00:00', enabled: false }
};

const appointmentDuration = 30; // minutes
const bufferTime = 0; // minutes between appointments

function generateTimeSlots(date) {
  const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'lowercase' });
  const dayConfig = businessHours[dayOfWeek];
  
  if (!dayConfig.enabled) return [];
  
  const slots = [];
  const [startHour, startMin] = dayConfig.start.split(':').map(Number);
  const [endHour, endMin] = dayConfig.end.split(':').map(Number);
  
  let currentTime = startHour * 60 + startMin; // Convert to minutes
  const endTime = endHour * 60 + endMin;
  
  while (currentTime + appointmentDuration <= endTime) {
    const hours = Math.floor(currentTime / 60);
    const minutes = currentTime % 60;
    slots.push(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`);
    currentTime += appointmentDuration + bufferTime;
  }
  
  return slots;
}

module.exports = {
  businessHours,
  appointmentDuration,
  bufferTime,
  generateTimeSlots
};