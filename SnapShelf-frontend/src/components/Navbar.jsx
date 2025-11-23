import { NavLink } from 'react-router-dom';
import styles from './Navbar.module.css';

function Navbar() {
  return (
    <header className={styles.navbar}>
      <div className={styles.inner}>
        <NavLink to="/" className={styles.brandContainer}>
          <img 
            src="/assets/images/logo.png" 
            alt="SnapShelf Logo" 
            className={styles.logo}
            onError={(e) => {
              // Hide logo if image doesn't exist
              e.target.style.display = 'none';
            }}
          />
        </NavLink>
        <nav className={styles.links}>
          <NavLink
            to="/snap"
            className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
          >
            Snap a Pic
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
