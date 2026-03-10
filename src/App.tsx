import { useState } from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import Services from './components/Services';
import Gallery from './components/Gallery';
import Schedule from './components/Schedule';
import Contact from './components/Contact';
import BookingModal from './components/BookingModal';
import ManageBookingModal from './components/ManageBookingModal';
import './App.css';

function App() {
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);

  const handleReserveClick = () => {
    setIsBookingOpen(true);
  };

  const handleCloseBooking = () => {
    setIsBookingOpen(false);
  };

  const handleManageClick = () => {
    setIsManageOpen(true);
  };

  const handleCloseManage = () => {
    setIsManageOpen(false);
  };

  return (
    <div className="app">
      <Header onReserveClick={handleReserveClick} onManageClick={handleManageClick} />
      <main>
        <Hero />
        <Services onReserveClick={handleReserveClick} />
        <Gallery />
        <Schedule />
        <Contact />
      </main>
      <BookingModal isOpen={isBookingOpen} onClose={handleCloseBooking} />
      <ManageBookingModal isOpen={isManageOpen} onClose={handleCloseManage} />
      <footer className="footer">
        <p>&copy; 2025 Barbería Elegante. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}

export default App;
