import { useNavigate } from 'react-router-dom';
import { useRef, useEffect } from 'react';
import styles from './Home.module.css';

function Home() {
  const navigate = useNavigate();
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = 0.7;
    }
  }, []);

  const handleSnapClick = () => {
    navigate('/snap');
  };

  return (
    <div className={styles.homeContainer}>
      <video 
        ref={videoRef}
        className={styles.videoBackground}
        autoPlay 
        loop 
        muted 
        playsInline
      >
        <source src="/assets/videos/background.mp4" type="video/mp4" />
        <source src="/assets/videos/background.webm" type="video/webm" />
      </video>
      <div className={styles.content}>
        <h1 className={styles.heading}>Food waste, no more.</h1>
        <p className={styles.subtitle}>Snap, store, see, and sort your entire fridge with SnapShelf.</p>
        <button className={styles.ctaButton} onClick={handleSnapClick}>
          Get Started
        </button>
      </div>
      <p className={styles.copyright}>© 2025 SnapShelf. All rights reserved.</p>
    </div>
  );
}

export default Home;
