import { useState, useEffect } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import {
  formatDate,
  getReservationsByPhone,
  cancelReservation,
  updateReservation,
  getAvailableTimeSlotsForDate,
  getReservationsForDate,
  isTimeAvailableForUpdate,
  type Reservation,
} from '../utils/notionReservations';
import { fetchSpanishHolidays, fetchVacationPeriods, getVacationForDate as getVacationPeriodForDate, type PublicHoliday, type VacationPeriod } from '../utils/holidays';
import './ManageBookingModal.css';

interface ManageBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'phone' | 'list' | 'edit-date' | 'edit-time' | 'confirm';
type Action = 'cancel' | 'edit';

const ManageBookingModal = ({ isOpen, onClose }: ManageBookingModalProps) => {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [newDate, setNewDate] = useState<Date | null>(null);
  const [newTime, setNewTime] = useState('');
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [vacationPeriods, setVacationPeriods] = useState<VacationPeriod[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Bloquear scroll del body cuando el modal está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Cargar festivos y vacaciones al abrir el modal
  useEffect(() => {
    const loadVacations = async () => {
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
      loadVacations();
    }
  }, [isOpen]);

  // Resetear estado al cerrar
  useEffect(() => {
    if (!isOpen) {
      setStep('phone');
      setPhone('');
      setReservations([]);
      setSelectedReservation(null);
      setAction(null);
      setNewDate(null);
      setNewTime('');
      setAvailableSlots([]);
      setError('');
      setSuccess('');
    }
  }, [isOpen]);

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      setError('Por favor, introduce tu número de teléfono');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const userReservations = await getReservationsByPhone(phone);
      
      if (userReservations.length === 0) {
        setError('No se encontraron reservas con este número de teléfono');
        setLoading(false);
        return;
      }

      setReservations(userReservations);
      setStep('list');
    } catch {
      setError('Error al buscar las reservas. Por favor, inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectReservation = (reservation: Reservation, selectedAction: Action) => {
    setSelectedReservation(reservation);
    setAction(selectedAction);
    
    if (selectedAction === 'cancel') {
      setStep('confirm');
    } else {
      setStep('edit-date');
    }
  };

  const getHolidayForDate = (date: Date): PublicHoliday | undefined => {
    const dateStr = formatDate(date);
    return holidays.find((h) => h.date === dateStr);
  };

  const handleDateSelect = async (date: Date) => {
    if (getHolidayForDate(date) || getVacationPeriodForDate(date, vacationPeriods)) return;
    setNewDate(date);
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
      
      // Obtener slots ya reservados (excluyendo la reserva actual)
      const dateStr = formatDate(date);
      const bookedSlots = await getReservationsForDate(dateStr);
      
      // Filtrar slots que ya están reservados (excluyendo la reserva actual)
      // Pero también excluir el mismo día+hora de la reserva original (no tiene sentido "modificar" sin cambiar nada)
      const availableFilteredSlots = filteredSlots.filter(slot => {
        const isBookedByOthers = bookedSlots.includes(slot);
        const isCurrentReservationSlot = selectedReservation && selectedReservation.date === dateStr && selectedReservation.time === slot;
        
        // Permitir el slot si no está reservado por otros, pero excluir el slot idéntico a la reserva actual
        if (isCurrentReservationSlot) return false;
        return !isBookedByOthers;
      });
      
      setAvailableSlots(availableFilteredSlots);
      setStep('edit-time');
    } catch (error) {
      console.error('Error al cargar horarios:', error);
      setError('Error al cargar horarios disponibles');
    } finally {
      setLoading(false);
    }
  };

  const handleTimeSelect = (time: string) => {
    setNewTime(time);
    setStep('confirm');
  };

  const handleConfirmCancel = async () => {
    if (!selectedReservation) return;

    setLoading(true);
    setError('');
    
    try {
      const success = await cancelReservation(selectedReservation.id);
      
      if (success) {
        setSuccess('Reserva cancelada correctamente');
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setError('Error al cancelar la reserva. Por favor, inténtalo de nuevo.');
      }
    } catch {
      setError('Error al cancelar la reserva. Por favor, inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmEdit = async () => {
    if (!selectedReservation || !newDate || !newTime) return;

    setLoading(true);
    setError('');
    
    try {
      const dateStr = formatDate(newDate);
      
      // Verificar disponibilidad nuevamente
      const available = await isTimeAvailableForUpdate(dateStr, newTime, selectedReservation.id);
      if (!available) {
        setError('Lo sentimos, esta hora ya no está disponible. Por favor, selecciona otra.');
        setStep('edit-time');
        setLoading(false);
        return;
      }

      const success = await updateReservation(selectedReservation.id, {
        date: dateStr,
        time: newTime,
      });
      
      if (success) {
        setSuccess('Reserva modificada correctamente');
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setError('Error al modificar la reserva. Por favor, inténtalo de nuevo.');
      }
    } catch {
      setError('Error al modificar la reserva. Por favor, inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 'list') {
      setStep('phone');
      setReservations([]);
    } else if (step === 'edit-date') {
      setStep('list');
      setSelectedReservation(null);
      setAction(null);
    } else if (step === 'edit-time') {
      setStep('edit-date');
      setNewTime('');
    } else if (step === 'confirm') {
      if (action === 'cancel') {
        setStep('list');
      } else if (newTime) {
        setStep('edit-time');
      } else {
        setStep('edit-date');
      }
    }
  };

  const formatDisplayDate = (dateStr: string): string => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('es-ES', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  if (!isOpen) return null;

  return (
    <div className="manage-modal-overlay" onClick={onClose}>
      <div className="manage-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="manage-modal-close" onClick={onClose}>
          ✕
        </button>
        
        <h2 className="manage-modal-title">Gestionar Reserva</h2>

        {error && <div className="manage-error-message">{error}</div>}
        {success && <div className="manage-success-message">{success}</div>}

        {tooltip && (
          <div
            className="calendar-tooltip-fixed"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.text}
          </div>
        )}

        {step === 'phone' && (
          <div className="manage-step">
            <p className="manage-step-description">
              Introduce tu número de teléfono para buscar tus reservas
            </p>
            <form onSubmit={handlePhoneSubmit} className="manage-form">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Número de teléfono"
                className="manage-input"
                required
              />
              <button type="submit" className="manage-btn manage-btn-primary" disabled={loading}>
                {loading ? 'Buscando...' : 'Buscar Reservas'}
              </button>
            </form>
          </div>
        )}

        {step === 'list' && (
          <div className="manage-step">
            <p className="manage-step-description">
              Reservas encontradas para {phone}
            </p>
            <div className="reservations-list">
              {reservations.map((reservation) => (
                <div key={reservation.id} className="reservation-item">
                  <div className="reservation-info">
                    <p className="reservation-date">{formatDisplayDate(reservation.date)}</p>
                    <p className="reservation-time">
                      <svg className="reservation-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                      {reservation.time}
                    </p>
                    <p className="reservation-name">
                      <svg className="reservation-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                      </svg>
                      {reservation.name}
                    </p>
                  </div>
                  <div className="reservation-actions">
                    <button
                      onClick={() => handleSelectReservation(reservation, 'edit')}
                      className="manage-btn manage-btn-secondary"
                    >
                      Modificar
                    </button>
                    <button
                      onClick={() => handleSelectReservation(reservation, 'cancel')}
                      className="manage-btn manage-btn-danger"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={handleBack} className="manage-btn manage-btn-outline">
              Volver
            </button>
          </div>
        )}

        {step === 'edit-date' && (
          <div className="manage-step">
            <p className="manage-step-description">
              Selecciona la nueva fecha para tu reserva
            </p>
            <div className="calendar-wrapper">
              {calendarLoading ? (
                <div className="booking-loading">Cargando calendario...</div>
              ) : (
              <Calendar
                onChange={(value) => handleDateSelect(value as Date)}
                value={newDate}
                minDate={new Date()}
                maxDate={(() => {
                  const max = new Date();
                  max.setMonth(max.getMonth() + 2);
                  return max;
                })()}
                locale="es-ES"
                tileDisabled={({ date }) => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  
                  const checkDate = new Date(date);
                  checkDate.setHours(0, 0, 0, 0);
                  
                  const day = date.getDay();
                  
                  // Deshabilitar domingos y sábados
                  if (day === 0 || day === 6) return true;
                  
                  // Deshabilitar fechas más allá de 2 meses
                  const maxDate = new Date(today);
                  maxDate.setMonth(maxDate.getMonth() + 2);
                  if (checkDate > maxDate) return true;

                  return false;
                }}
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
              />
              )}
            </div>
            <button onClick={handleBack} className="manage-btn manage-btn-outline">
              Volver
            </button>
          </div>
        )}

        {step === 'edit-time' && (
          <div className="manage-step">
            <p className="manage-step-description">
              Selecciona el nuevo horario
            </p>
            {loading ? (
              <p>Cargando horarios disponibles...</p>
            ) : availableSlots.length === 0 ? (
              <p className="no-slots">No hay horarios disponibles para este día</p>
            ) : (
              <div className="time-slots-grid">
                {availableSlots.map((slot) => (
                  <button
                    key={slot}
                    onClick={() => handleTimeSelect(slot)}
                    className="time-slot-btn"
                  >
                    {slot}
                  </button>
                ))}
              </div>
            )}
            <button onClick={handleBack} className="manage-btn manage-btn-outline">
              Volver
            </button>
          </div>
        )}

        {step === 'confirm' && (
          <div className="manage-step">
            <h3 className="confirm-title">
              {action === 'cancel' ? '¿Cancelar reserva?' : 'Confirmar cambios'}
            </h3>
            
            {selectedReservation && (
              <div className="confirm-details">
                {action === 'cancel' ? (
                  <>
                    <p className="confirm-label">Reserva actual:</p>
                    <div className="detail-card">
                      <p className="detail-row">
                        <svg className="detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                          <line x1="16" y1="2" x2="16" y2="6"></line>
                          <line x1="8" y1="2" x2="8" y2="6"></line>
                          <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        {formatDisplayDate(selectedReservation.date)}
                      </p>
                      <p className="detail-row">
                        <svg className="detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        {selectedReservation.time}
                      </p>
                      <p className="detail-row">
                        <svg className="detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                          <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        {selectedReservation.name}
                      </p>
                    </div>
                    <p className="confirm-warning">
                      Esta acción no se puede deshacer.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="comparison">
                      <div className="comparison-item">
                        <p className="confirm-label">Reserva actual:</p>
                        <div className="detail-card">
                          <p className="detail-row">
                            <svg className="detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                              <line x1="16" y1="2" x2="16" y2="6"></line>
                              <line x1="8" y1="2" x2="8" y2="6"></line>
                              <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                            {formatDisplayDate(selectedReservation.date)}
                          </p>
                          <p className="detail-row">
                            <svg className="detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"></circle>
                              <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            {selectedReservation.time}
                          </p>
                        </div>
                      </div>
                      <div className="comparison-arrow">→</div>
                      <div className="comparison-item">
                        <p className="confirm-label">Nueva reserva:</p>
                        <div className="detail-card detail-card-new">
                          <p className="detail-row">
                            <svg className="detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                              <line x1="16" y1="2" x2="16" y2="6"></line>
                              <line x1="8" y1="2" x2="8" y2="6"></line>
                              <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                            {newDate && formatDisplayDate(formatDate(newDate))}
                          </p>
                          <p className="detail-row">
                            <svg className="detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"></circle>
                              <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            {newTime}
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="confirm-actions">
              <button onClick={handleBack} className="manage-btn manage-btn-outline" disabled={loading || !!success}>
                Volver
              </button>
              <button
                onClick={action === 'cancel' ? handleConfirmCancel : handleConfirmEdit}
                className={`manage-btn ${action === 'cancel' ? 'manage-btn-danger' : 'manage-btn-primary'}`}
                disabled={loading || !!success}
              >
                {loading ? 'Procesando...' : action === 'cancel' ? 'Confirmar Cancelación' : 'Confirmar Cambios'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManageBookingModal;
