import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyzeFridge } from '../../api/fridge.js';
import styles from './Home.module.css';

function Home() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return undefined;
    }

    const nextPreview = URL.createObjectURL(file);
    setPreviewUrl(nextPreview);

    return () => URL.revokeObjectURL(nextPreview);
  }, [file]);

  const handleFileChange = (event) => {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!file) {
      setError('Please select a fridge image to analyze.');
      return;
    }

    setIsAnalyzing(true);
    setError('');

    try {
      await analyzeFridge(file);
      navigate('/inventory');
    } catch (err) {
      // Extract error message with better handling
      let message = 'Unable to analyze the fridge right now.';
      
      if (err?.response?.data?.error) {
        // Backend sent a specific error message
        message = err.response.data.error;
      } else if (err?.message) {
        // Error object has a message
        message = err.message;
      } else if (err?.response?.status) {
        // HTTP error status
        message = `Server error (${err.response.status}). Please try again.`;
      }
      
      setError(message);
      
      // Log detailed error for debugging
      console.error('Error analyzing fridge:', {
        message: err?.message,
        response: err?.response?.data,
        status: err?.response?.status,
        code: err?.code,
        isTimeout: err?.isTimeout,
        isNetworkError: err?.isNetworkError,
        fullError: err
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <section className={styles.wrapper}>
      <h1>Scan Your Fridge</h1>
      <p className={styles.subtitle}>Upload a clear photo of your fridge interior to get an instant inventory.</p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label} htmlFor="fridge-image">
          Fridge image
        </label>
        <input
          id="fridge-image"
          type="file"
          name="image"
          accept="image/*"
          onChange={handleFileChange}
          className={styles.fileInput}
        />

        {previewUrl && (
          <div className={styles.previewContainer}>
            <img src={previewUrl} alt="Selected fridge" className={styles.previewImage} />
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={styles.primaryButton} disabled={!file || isAnalyzing}>
          {isAnalyzing ? 'Analyzing...' : 'Analyze Fridge'}
        </button>

        {isAnalyzing && (
          <div className={styles.spinnerRow}>
            <span className={styles.spinner} aria-hidden="true" />
            <span>Scanning your fridge...</span>
          </div>
        )}
      </form>

      <p className={styles.helperText}>We&apos;ll detect items, estimate quantities, and predict when things expire.</p>
    </section>
  );
}

export default Home;
