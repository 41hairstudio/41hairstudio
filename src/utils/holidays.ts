export interface PublicHoliday {
  date: string;
  localName: string;
  name: string;
  countryCode: string;
  fixed: boolean;
  global: boolean;
  counties: string[] | null;
  launchYear: number | null;
  types: string[];
}

export interface VacationPeriod {
  motivo: string;
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string;    // YYYY-MM-DD
}

interface NotionVacacionesPage {
  properties: {
    Motivo?: { title?: { plain_text: string }[] };
    FechaInicio?: { date?: { start?: string } };
    FechaFin?: { date?: { start?: string } };
  };
}

interface NotionVacacionesResponse {
  results: NotionVacacionesPage[];
}

export async function fetchVacationPeriods(): Promise<VacationPeriod[]> {
  try {
    const response = await fetch('/api/notion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'query-vacaciones', body: {} }),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch vacation periods');
    }
    const data: NotionVacacionesResponse = await response.json();
    return data.results
      .map((page) => ({
        motivo: page.properties.Motivo?.title?.[0]?.plain_text ?? '',
        fechaInicio: page.properties.FechaInicio?.date?.start ?? '',
        fechaFin: page.properties.FechaFin?.date?.start ?? '',
      }))
      .filter((p) => p.fechaInicio && p.fechaFin);
  } catch (error) {
    console.error('Error fetching vacation periods:', error);
    return [];
  }
}

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isInVacationPeriod(date: Date, vacationPeriods: VacationPeriod[]): boolean {
  const dateStr = toLocalDateStr(date);
  return vacationPeriods.some(
    (period) => dateStr >= period.fechaInicio && dateStr <= period.fechaFin,
  );
}

export function getVacationForDate(date: Date, vacationPeriods: VacationPeriod[]): VacationPeriod | undefined {
  const dateStr = toLocalDateStr(date);
  return vacationPeriods.find(
    (period) => dateStr >= period.fechaInicio && dateStr <= period.fechaFin,
  );
}

export async function fetchSpanishHolidays(year: number): Promise<PublicHoliday[]> {
  try {
    const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/ES`);
    if (!response.ok) {
      throw new Error('Failed to fetch holidays');
    }
    const all: PublicHoliday[] = await response.json();
    // Festivos nacionales + Andalucía (ES-AN), que incluye Sevilla
    return all.filter(
      (h) => h.global || h.counties === null || h.counties.includes('ES-AN'),
    );
  } catch (error) {
    console.error('Error fetching holidays:', error);
    return [];
  }
}

export function isHoliday(date: Date, holidays: PublicHoliday[]): boolean {
  const dateString = date.toISOString().split('T')[0];
  return holidays.some(holiday => holiday.date === dateString);
}

export function isSunday(date: Date): boolean {
  return date.getDay() === 0;
}

export function isOpen(date: Date, holidays: PublicHoliday[]): boolean {
  // Closed on Sundays and holidays
  if (isSunday(date) || isHoliday(date, holidays)) {
    return false;
  }
  
  const dayOfWeek = date.getDay();
  const currentHour = date.getHours();
  const currentMinutes = date.getMinutes();
  const currentTime = currentHour * 60 + currentMinutes; // Convertir a minutos
  
  // Saturday (6): Variable según demanda - consideramos cerrado por defecto
  if (dayOfWeek === 6) {
    return false;
  }
  
  // Monday to Friday (1-5): 10:00 - 14:00 y 17:00 - 21:00
  return (currentTime >= 600 && currentTime < 840) || // 10:00 - 14:00
         (currentTime >= 1020 && currentTime < 1260); // 17:00 - 21:00
}

export function getCurrentSchedule(date: Date, holidays: PublicHoliday[]): string {
  if (isSunday(date) || isHoliday(date, holidays)) {
    return 'Cerrado';
  }
  
  const dayOfWeek = date.getDay();
  
  // Saturday (6)
  if (dayOfWeek === 6) {
    return 'Consultar disponibilidad';
  }
  
  // Monday to Friday (1-5)
  return '10:00 - 14:00 y 17:00 - 21:00';
}
