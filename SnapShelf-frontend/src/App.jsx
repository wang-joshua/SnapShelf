import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import Home from './pages/Home/Home.jsx';
import Snap from './pages/Snap/Snap.jsx';
import Inventory from './pages/Inventory/Inventory.jsx';
import Grocery from './pages/Grocery/Grocery.jsx';
import Compare from './pages/Compare/Compare.jsx';
import styles from './App.module.css';

function App() {
  return (
    <div className={styles.appShell}>
      <Navbar />
      <main className={styles.main}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/snap" element={<Snap />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/grocery" element={<Grocery />} />
          <Route path="/compare" element={<Compare />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default App;
