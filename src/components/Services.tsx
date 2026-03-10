import './Services.css';

interface Service {
  name: string;
  description: string;
  duration: string;
  price: string;
  note?: string;
}

interface ServicesProps {
  onReserveClick: () => void;
}

const Services = ({ onReserveClick }: ServicesProps) => {
  const services: Service[] = [
    { 
      name: 'Corte de pelo', 
      description: 'Corte personalizado adaptado a tu estilo',
      duration: '30 min',
      price: '10€'
    },
    { 
      name: 'Arreglo de barba', 
      description: 'Perfilado y mantenimiento profesional',
      duration: '15 min',
      price: '5€'
    },
    { 
      name: 'Corte + Barba', 
      description: 'Servicio completo de corte y arreglo de barba',
      duration: '30 min',
      price: '12€'
    },
    { 
      name: 'Decoloración', 
      description: 'Tratamiento de decoloración profesional',
      duration: '3 horas',
      price: '60€'
    },
    { 
      name: 'Mechas', 
      description: 'Mechas profesionales con productos de calidad',
      duration: '3 horas',
      price: '35€'
    },
    { 
      name: 'Servicio de boda', 
      description: 'Peinado y arreglo completo para tu día especial',
      duration: '2 horas',
      price: '50€'
    },
  ];

  return (
    <section className="services" id="servicios">
      <div className="services-container">
        <h2 className="services-title">Nuestros Servicios</h2>
        <div className="services-grid">
          {services.map((service, index) => (
            <div key={index} className="service-card" style={{ cursor: 'pointer'}} onClick={onReserveClick}>
              <h3 className="service-name">{service.name}</h3>
              <p className="service-description">{service.description}</p>
              <div className="service-details">
                <span className="service-duration">
                  <svg className="service-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  {service.duration}
                </span>
                <span className="service-price">{service.price}</span>
              </div>
              <div className="service-note-container">
                {service.note && (
                  <p className="service-note">
                    <svg className="service-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    {service.note}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Services;
