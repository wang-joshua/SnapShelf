import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Home from './pages/Home/Home.jsx';
import Inventory from './pages/Inventory/Inventory.jsx';
import styles from './App.module.css';

function App() {
  return (
    <div className={styles.appShell}>
      <Navbar />
      <main className={styles.main}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/inventory" element={<Inventory />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
