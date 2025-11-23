import { useCallback, useEffect, useState } from 'react';
import {
  getGroceryList,
  addGroceryItem,
  deleteGroceryItem
} from '../../api/grocery.js';
import styles from './Grocery.module.css';

const CATEGORY_OPTIONS = ['dairy', 'produce', 'meat', 'drinks', 'condiments', 'other'];

function Grocery() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const [qtyNeeded, setQtyNeeded] = useState(1);
  const [category, setCategory] = useState('other');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadList = useCallback(async () => {
    try {
      setError('');
      setLoading(true);
      const { data } = await getGroceryList();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err?.response?.data?.error || 'Failed to load grocery list';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError('');
      const payload = {
        name,
        qtyNeeded: Number(qtyNeeded),
        category
      };
      const { data } = await addGroceryItem(payload);
      setItems(Array.isArray(data) ? data : []);
      setName('');
      setQtyNeeded(1);
      setCategory('other');
    } catch (err) {
      const message = err?.response?.data?.error || 'Failed to add item';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      setError('');
      const { data } = await deleteGroceryItem(id);
      const updated = Array.isArray(data?.list) ? data.list : null;
      if (updated) {
        setItems(updated);
      } else {
        // Fallback to refetch if server doesn't return list
        await loadList();
      }
    } catch (err) {
      const message = err?.response?.data?.error || 'Failed to delete item';
      setError(message);
    }
  };

  return (
    <section className={styles.container}>
      <h1>Grocery List</h1>
      <p>Plan what to buy and keep it in sync with your fridge.</p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.formRow}>
          <label className={styles.label}>
            Item name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Milk"
            />
          </label>
          <label className={styles.label}>
            Quantity needed
            <input
              type="number"
              min="1"
              value={qtyNeeded}
              onChange={(e) => setQtyNeeded(e.target.value)}
              required
            />
          </label>
        </div>
        <div className={styles.formRow}>
          <label className={styles.label}>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={submitting} className={styles.submitButton}>
            {submitting ? 'Adding...' : 'Add to list'}
          </button>
        </div>
      </form>

      {error && <p className={styles.error}>{error}</p>}
      {loading ? (
        <p>Loading grocery list...</p>
      ) : items.length === 0 ? (
        <p>No items yet. Add your first grocery item above.</p>
      ) : (
        <div className={styles['grocery-grid']}>
          {items.map((item) => (
            <article key={item._id} className={styles.card}>
              <div className={styles.cardHeader}>
                <h3>{item.name}</h3>
                <span className={styles.category}>{item.category}</span>
              </div>
              <p className={styles.qty}>Need: {item.qtyNeeded}</p>
              <button
                type="button"
                onClick={() => handleDelete(item._id)}
                className={styles.deleteButton}
              >
                Delete
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default Grocery;
