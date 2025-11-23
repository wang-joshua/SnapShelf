import { useEffect, useState, useCallback } from 'react';
import { getGroceryComparison } from '../../api/grocery.js';
import styles from './Compare.module.css';

function Compare() {
  const [data, setData] = useState({
    fullySatisfied: [],
    partiallySatisfied: [],
    missing: []
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadComparison = useCallback(async () => {
    try {
      setError('');
      setLoading(true);
      const { data: payload } = await getGroceryComparison();
      setData({
        fullySatisfied: payload?.fullySatisfied || [],
        partiallySatisfied: payload?.partiallySatisfied || [],
        missing: payload?.missing || []
      });
    } catch (err) {
      const message = err?.response?.data?.error || 'Failed to load comparison';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadComparison();
  }, [loadComparison]);

  const renderSection = (title, items, variant) => (
    <section className={styles.section}>
      <h2>{title}</h2>
      {items.length === 0 ? (
        <p className={styles.muted}>No items in this category.</p>
      ) : (
        <div className={styles['compare-grid']}>
          {items.map((item) => (
            <article key={`${variant}-${item.name}`} className={`${styles.card} ${styles[variant]}`}>
              <h3>{item.name}</h3>
              <p>Needed: {item.qtyNeeded}</p>
              <p>In SnapShelf: {item.qtyInFridge}</p>
              {variant === 'partial' && (
                <p className={styles.emphasis}>
                  Buy {Math.max(0, item.qtyNeeded - item.qtyInFridge)} more
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Fridge vs Grocery List</p>
          <h1>What you have vs what you need</h1>
        </div>
        <button type="button" className={styles.refreshButton} onClick={loadComparison} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      {error && <p className={styles.error}>{error}</p>}
      {loading ? (
        <p>Loading comparison...</p>
      ) : (
        <>
          {renderSection('You’re Covered ✅', data.fullySatisfied, 'full')}
          {renderSection('You Have Some, Need More ⚠️', data.partiallySatisfied, 'partial')}
          {renderSection('You’re Missing ❌', data.missing, 'missing')}
        </>
      )}
    </div>
  );
}

export default Compare;
