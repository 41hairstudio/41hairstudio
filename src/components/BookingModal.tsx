import { useState, useEffect } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import {
  formatDate,
  getAvailableTimeSlotsForDate,
  getReservationsForDate,
  isTimeAvailable,
  saveReservation,
} from '../utils/notionReservations';
import { sendConfirmationEmails } from '../utils/emailService';
import { generateICSFile } from '../utils/calendar';
import { fetchSpanishHolidays, fetchVacationPeriods, getVacationForDate as getVacationPeriodForDate, type PublicHoliday, type VacationPeriod } from '../utils/holidays';
import './BookingModal.css';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'date' | 'time' | 'form' | 'review' | 'confirmation';

interface BookingData {
  date: Date | null;
  time: string;
  name: string;
  email: string;
  phone: string;
}

const BookingModal = ({ isOpen, onClose }: BookingModalProps) => {
  const [step, setStep] = useState<Step>('date');
  const [bookingData, setBookingData] = useState<BookingData>({
    date: null,
    time: '',
    name: '',
    email: '',
    phone: '',
  });
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [vacationPeriods, setVacationPeriods] = useState<VacationPeriod[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; phone?: string }>({});

  // Bloquear scroll del body cuando el modal está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    // Cleanup al desmontar
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Cargar festivos y vacaciones al abrir el modal (antes de mostrar el calendario)
  useEffect(() => {
    const loadCalendarData = async () => {
      setCalendarLoading(true);
      try {
        const [holidayData, vacations] = await Promise.all([
          fetchSpanishHolidays(new Date().getFullYear()),
          fetchVacationPeriods(),
        ]);
        setHolidays(holidayData);
        setVacationPeriods(vacations);
      } finally {
        setCalendarLoading(false);
      }
    };
    if (isOpen) {
      loadCalendarData();
    }
  }, [isOpen]);

  const getHolidayForDate = (date: Date): PublicHoliday | undefined => {
    const dateStr = formatDate(date);
    return holidays.find((h) => h.date === dateStr);
  };

  const handleDateSelect = async (date: Date) => {
    if (getHolidayForDate(date) || getVacationPeriodForDate(date, vacationPeriods)) return;
    setBookingData({ ...bookingData, date });
    setLoading(true);
    
    try {
      const slots = getAvailableTimeSlotsForDate(date);
      
      // Filtrar slots pasados si es el día de hoy
      const now = new Date();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const checkDate = new Date(date);
      checkDate.setHours(0, 0, 0, 0);
      
      const isToday = checkDate.getTime() === today.getTime();
      
      const filteredSlots = isToday 
        ? slots.filter(slot => {
            const [hours, minutes] = slot.split(':').map(Number);
            const slotTime = new Date(date);
            slotTime.setHours(hours, minutes, 0, 0);
            return slotTime > now;
          })
        : slots;
      
      // Obtener slots ya reservados desde Notion
      const dateStr = formatDate(date);
      const bookedSlots = await getReservationsForDate(dateStr);
      
      // Filtrar slots que ya están reservados
      const availableFilteredSlots = filteredSlots.filter(slot => !bookedSlots.includes(slot));
      
      setAvailableSlots(availableFilteredSlots);
      setStep('time');
    } catch (error) {
      console.error('Error al cargar horarios:', error);
      // En caso de error, mostrar todos los slots disponibles
      const slots = getAvailableTimeSlotsForDate(date);
      setAvailableSlots(slots);
      setStep('time');
    } finally {
      setLoading(false);
    }
  };

  const handleTimeSelect = (time: string) => {
    setBookingData({ ...bookingData, time });
    setStep('form');
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { name?: string; email?: string; phone?: string } = {};

    if (!bookingData.name.trim()) {
      errors.name = 'El nombre es obligatorio';
    }

    if (!bookingData.email.trim()) {
      errors.email = 'El correo electrónico es obligatorio';
    } else if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/.test(bookingData.email)) {
      errors.email = 'Introduce un correo electrónico válido';
    }

    const digitsOnly = bookingData.phone.replace(/\s/g, '');
    if (!digitsOnly) {
      errors.phone = 'El teléfono es obligatorio';
    } else if (digitsOnly.length !== 9) {
      errors.phone = 'El teléfono debe tener exactamente 9 dígitos';
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setError('');
    setStep('review');
  };

  const handleConfirmBooking = async () => {
    if (!bookingData.date) return;

    setLoading(true);
    setError('');

    try {
      const dateStr = formatDate(bookingData.date);
      
      // Verificar disponibilidad nuevamente
      const available = await isTimeAvailable(dateStr, bookingData.time);
      if (!available) {
        setError('Lo sentimos, esta hora ya no está disponible. Por favor, selecciona otra.');
        setStep('time');
        setLoading(false);
        return;
      }

      // Guardar la reserva
      const savedReservation = await saveReservation({
        date: dateStr,
        time: bookingData.time,
        name: bookingData.name,
        email: bookingData.email,
        phone: bookingData.phone,
      });

      if (!savedReservation) {
        setError('Error al guardar la reserva. Por favor, inténtalo de nuevo.');
        setLoading(false);
        return;
      }

      // Enviar emails
      const emailSent = await sendConfirmationEmails({
        name: bookingData.name,
        email: bookingData.email,
        phone: bookingData.phone,
        date: dateStr,
        time: bookingData.time,
      });

      if (!emailSent) {
        console.warn('No se pudieron enviar los emails de confirmación');
      }

      setStep('confirmation');
    } catch (err) {
      setError('Hubo un error al procesar tu reserva. Por favor, inténtalo de nuevo.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('date');
    setBookingData({
      date: null,
      time: '',
      name: '',
      email: '',
      phone: '',
    });
    setError('');
    setFieldErrors({});
    onClose();
  };

  const handleDownloadCalendar = () => {
    if (!bookingData.date) return;

    const dateStr = formatDate(bookingData.date);
    const icsContent = generateICSFile({
      date: dateStr,
      time: bookingData.time,
      name: bookingData.name,
      email: bookingData.email,
      phone: bookingData.phone,
      conRecordatorio: true, // Con recordatorio para el cliente
    });

    // Crear blob y descargarlo
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'cita-41-hair-studio.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleBack = () => {
    setError('');
    setFieldErrors({});
    if (step === 'time') setStep('date');
    else if (step === 'form') setStep('time');
    else if (step === 'review') setStep('form');
  };

  const isDateDisabled = ({ date }: { date: Date }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    
    // Deshabilitar fechas pasadas
    if (checkDate < today) return true;
    
    // Deshabilitar fechas más allá de 2 meses desde hoy
    const maxDate = new Date(today);
    maxDate.setMonth(maxDate.getMonth() + 2);
    if (checkDate > maxDate) return true;
    
    // Deshabilitar domingos
    if (date.getDay() === 0) return true;
    
    // Deshabilitar sábados (no disponibles para reserva online)
    if (date.getDay() === 6) return true;
    
    // Deshabilitar el día de hoy si no quedan horas disponibles
    const isToday = checkDate.getTime() === today.getTime();
    if (isToday) {
      const now = new Date();
      const slots = getAvailableTimeSlotsForDate(date);
      
      // Si no hay slots (domingo u otro caso), deshabilitar
      if (slots.length === 0) return true;
      
      // Verificar si hay algún slot futuro disponible
      const hasFutureSlots = slots.some(slot => {
        const [hours, minutes] = slot.split(':').map(Number);
        const slotTime = new Date(date);
        slotTime.setHours(hours, minutes, 0, 0);
        return slotTime > now;
      });
      
      if (!hasFutureSlots) return true;
    }
    
    return false;
  };

  const formatDateForDisplay = (date: Date) => {
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (!isOpen) return null;

  return (
    <div className="booking-modal-overlay" onClick={handleClose}>
      <div className="booking-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="booking-modal-close" onClick={handleClose}>
          ✕
        </button>

        <div className="booking-stepper">
          <div className={`stepper-step ${step === 'date' ? 'active' : step === 'time' || step === 'form' || step === 'review' || step === 'confirmation' ? 'completed' : ''}`}>
            <span className="stepper-number">1</span>
            <span className="stepper-label">Fecha</span>
          </div>
          <div className="stepper-line"></div>
          <div className={`stepper-step ${step === 'time' ? 'active' : step === 'form' || step === 'review' || step === 'confirmation' ? 'completed' : ''}`}>
            <span className="stepper-number">2</span>
            <span className="stepper-label">Hora</span>
          </div>
          <div className="stepper-line"></div>
          <div className={`stepper-step ${step === 'form' ? 'active' : step === 'review' || step === 'confirmation' ? 'completed' : ''}`}>
            <span className="stepper-number">3</span>
            <span className="stepper-label">Datos</span>
          </div>
          <div className="stepper-line"></div>
          <div className={`stepper-step ${step === 'review' ? 'active' : step === 'confirmation' ? 'completed' : ''}`}>
            <span className="stepper-number">4</span>
            <span className="stepper-label">Confirmar</span>
          </div>
        </div>

        {error && <div className="booking-error">{error}</div>}

        {tooltip && (
          <div
            className="calendar-tooltip-fixed"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.text}
          </div>
        )}

        <div className="booking-content">
          {step === 'date' && (
            <div className="booking-step">
              <h2 className="booking-title">Selecciona una fecha</h2>
              {calendarLoading ? (
                <div className="booking-loading">Cargando calendario...</div>
              ) : (
                <Calendar
                  onChange={(value) => handleDateSelect(value as Date)}
                  value={bookingData.date}
                  tileDisabled={isDateDisabled}
                  tileClassName={({ date, view }) => {
                    if (view !== 'month') return null;
                    if (getVacationPeriodForDate(date, vacationPeriods)) return 'tile-vacation';
                    if (getHolidayForDate(date)) return 'tile-holiday';
                    return null;
                  }}
                  tileContent={({ date, view }) => {
                    if (view !== 'month') return null;
                    const vacation = getVacationPeriodForDate(date, vacationPeriods);
                    const holiday = getHolidayForDate(date);
                    const label = vacation?.motivo || holiday?.localName;
                    if (!label) return null;
                    return (
                      <span
                        className="tile-blocked-trigger"
                        onMouseEnter={(e) => setTooltip({ text: label, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setTooltip(null)}
                        onMouseMove={(e) => setTooltip({ text: label, x: e.clientX, y: e.clientY })}
                      />
                    );
                  }}
                  locale="es-ES"
                  minDate={new Date()}
                  maxDate={(() => {
                    const max = new Date();
                    max.setMonth(max.getMonth() + 2);
                    return max;
                  })()}
                />
              )}
            </div>
          )}

          {step === 'time' && (
            <div className="booking-step">
              <h2 className="booking-title">Selecciona una hora</h2>
              <p className="booking-subtitle">
                {bookingData.date && formatDateForDisplay(bookingData.date)}
              </p>
              <div className="time-slots">
                {availableSlots.length === 0 ? (
                  <div className="no-slots-container">
                    <p className="no-slots">No hay horarios disponibles para este día</p>
                    <p className="no-slots-hint">
                      {bookingData.date && bookingData.date.toDateString() === new Date().toDateString()
                        ? 'Las horas disponibles para hoy ya han pasado. Por favor, selecciona otro día.'
                        : 'Por favor, selecciona otro día.'}
                    </p>
                  </div>
                ) : (
                  availableSlots.map((slot) => {
                    return (
                      <button
                        key={slot}
                        className="time-slot"
                        onClick={() => handleTimeSelect(slot)}
                      >
                        {slot}
                      </button>
                    );
                  })
                )}
              </div>
              <button className="booking-back-btn" onClick={handleBack}>
                Volver
              </button>
            </div>
          )}

          {step === 'form' && (
            <div className="booking-step">
              <h2 className="booking-title">Tus datos</h2>
              <form onSubmit={handleFormSubmit} className="booking-form" noValidate>
                <div className="form-group">
                  <label htmlFor="name">Nombre completo</label>
                  <input
                    type="text"
                    id="name"
                    value={bookingData.name}
                    onChange={(e) => {
                      setBookingData({ ...bookingData, name: e.target.value });
                      if (fieldErrors.name) setFieldErrors({ ...fieldErrors, name: undefined });
                    }}
                    placeholder="Escribe tu nombre"
                    className={fieldErrors.name ? 'input-error' : ''}
                  />
                  {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
                </div>
                <div className="form-group">
                  <label htmlFor="email">Correo electrónico</label>
                  <input
                    type="email"
                    id="email"
                    value={bookingData.email}
                    onChange={(e) => {
                      setBookingData({ ...bookingData, email: e.target.value });
                      if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: undefined });
                    }}
                    placeholder="tu@email.com"
                    className={fieldErrors.email ? 'input-error' : ''}
                  />
                  {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
                </div>
                <div className="form-group">
                  <label htmlFor="phone">Teléfono</label>
                  <div className="phone-input-wrapper">
                    <span className="phone-prefix">+34</span>
                    <input
                      type="tel"
                      id="phone"
                      value={bookingData.phone}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '').slice(0, 9);
                        setBookingData({ ...bookingData, phone: raw });
                        if (fieldErrors.phone) setFieldErrors({ ...fieldErrors, phone: undefined });
                      }}
                      placeholder="600123456"
                      maxLength={9}
                      className={fieldErrors.phone ? 'input-error' : ''}
                    />
                  </div>
                  {fieldErrors.phone && <span className="field-error">{fieldErrors.phone}</span>}
                </div>
                <div className="form-actions">
                  <button type="button" className="booking-back-btn" onClick={handleBack}>
                    Volver
                  </button>
                  <button type="submit" className="booking-next-btn">
                    Continuar
                  </button>
                </div>
              </form>
            </div>
          )}

          {step === 'review' && (
            <div className="booking-step">
              <h2 className="booking-title">Revisa tu reserva</h2>
              <div className="booking-review">
                <div className="review-item">
                  <span className="review-label">Fecha:</span>
                  <span className="review-value">
                    {bookingData.date && formatDateForDisplay(bookingData.date)}
                  </span>
                </div>
                <div className="review-item">
                  <span className="review-label">Hora:</span>
                  <span className="review-value">{bookingData.time}</span>
                </div>
                <div className="review-item">
                  <span className="review-label">Nombre:</span>
                  <span className="review-value">{bookingData.name}</span>
                </div>
                <div className="review-item">
                  <span className="review-label">Email:</span>
                  <span className="review-value">{bookingData.email}</span>
                </div>
                <div className="review-item">
                  <span className="review-label">Teléfono:</span>
                  <span className="review-value">+34 {bookingData.phone}</span>
                </div>
              </div>
              <div className="form-actions">
                <button className="booking-back-btn" onClick={handleBack}>
                  Volver
                </button>
                <button
                  className="booking-confirm-btn"
                  onClick={handleConfirmBooking}
                  disabled={loading}
                >
                  {loading ? 'Procesando...' : 'Confirmar reserva'}
                </button>
              </div>
            </div>
          )}

          {step === 'confirmation' && (
            <div className="booking-step">
              <div className="booking-success">
                <div className="success-icon">✓</div>
                <h2 className="booking-title">¡Reserva confirmada!</h2>
                <p className="success-message">
                  Tu reserva ha sido confirmada para el{' '}
                  {bookingData.date && formatDateForDisplay(bookingData.date)} a las{' '}
                  {bookingData.time}.
                </p>
                <p className="success-submessage">
                  Hemos enviado un correo de confirmación a {bookingData.email}
                </p>
                <button className="booking-calendar-btn" onClick={handleDownloadCalendar}>
                  <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  Añadir a Calendario
                </button>
                <button className="booking-done-btn" onClick={handleClose}>
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookingModal;
