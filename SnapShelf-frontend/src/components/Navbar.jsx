import { NavLink } from 'react-router-dom';
import styles from './Navbar.module.css';

function Navbar() {
  return (
    <header className={styles.navbar}>
      <div className={styles.inner}>
        <div className={styles.brandContainer}>
          <img 
            src="/assets/images/logo.png" 
            alt="SnapShelf Logo" 
            className={styles.logo}
            onError={(e) => {
              // Hide logo if image doesn't exist
              e.target.style.display = 'none';
            }}
          />
        </div>
        <nav className={styles.links}>
          <NavLink
            to="/"
            className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
          >
            Home
          </NavLink>
          <NavLink
            to="/inventory"
            className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
          >
            Inventory
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

export default Navbar;
