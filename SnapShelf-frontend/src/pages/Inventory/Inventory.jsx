import { useCallback, useEffect, useState } from 'react';
import { fetchItems } from '../../api/fridge.js';
import styles from './Inventory.module.css';

const formatCategory = (value = 'other') => {
  if (!value) return 'Other';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

function Inventory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadItems = useCallback(async () => {
    try {
      setError('');
      setRefreshing(true);
      const data = await fetchItems();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err?.response?.data?.error || 'Unable to fetch fridge inventory.';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  return (
    <section className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>Your Fridge Inventory</h1>
          <p>Every detected item lives here with estimated quantities and expiration.</p>
        </div>
        <button type="button" className={styles.refreshButton} onClick={loadItems} disabled={refreshing}>
          {refreshing ? 'Refreshing...' : 'Refresh Inventory'}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {loading ? (
        <div className={styles.loadingState}>
          <span className={styles.loadingSpinner} aria-hidden="true" />
          <span>Loading items...</span>
        </div>
      ) : items.length === 0 ? (
        <p className={styles.emptyState}>No items detected yet. Scan your fridge to get started.</p>
      ) : (
        <div className={styles.grid}>
          {items.map((item) => (
            <article key={item._id ?? item.name} className={styles.card}>
              <div className={styles.itemName}>{item.name}</div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Quantity</span>
                <span className={styles.statValue}>{item.qty ?? 0}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Expires in</span>
                <span className={styles.statValue}>
                  {item.expiresInDays ?? 0} day{(item.expiresInDays ?? 0) === 1 ? '' : 's'}
                </span>
              </div>
              <div className={styles.categoryPill}>{formatCategory(item.category)}</div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default Inventory;
