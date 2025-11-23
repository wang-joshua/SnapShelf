import { useCallback, useEffect, useState, useMemo } from 'react';
import { fetchItems } from '../../api/fridge.js';
import styles from './Inventory.module.css';

const formatCategory = (value = 'other') => {
  if (!value) return 'Other';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

// Category color mapping
const CATEGORY_COLORS = {
  produce: { bg: '#ecfdf5', color: '#047857', border: '#10b981' },
  dairy: { bg: '#eff6ff', color: '#1e40af', border: '#3b82f6' },
  meat: { bg: '#fef2f2', color: '#991b1b', border: '#ef4444' },
  drinks: { bg: '#f0f9ff', color: '#0c4a6e', border: '#0ea5e9' },
  beverages: { bg: '#f0f9ff', color: '#0c4a6e', border: '#0ea5e9' },
  leftovers: { bg: '#fefce8', color: '#854d0e', border: '#eab308' },
  condiments: { bg: '#faf5ff', color: '#6b21a8', border: '#a855f7' },
  frozen: { bg: '#e0f2fe', color: '#0369a1', border: '#0ea5e9' },
  bakery: { bg: '#fef3c7', color: '#92400e', border: '#f59e0b' },
  snacks: { bg: '#fce7f3', color: '#9f1239', border: '#ec4899' },
  seafood: { bg: '#cffafe', color: '#155e75', border: '#06b6d4' },
  poultry: { bg: '#fee2e2', color: '#7f1d1d', border: '#f87171' },
  grains: { bg: '#fef3c7', color: '#78350f', border: '#fbbf24' },
  spices: { bg: '#f3e8ff', color: '#581c87', border: '#9333ea' },
  other: { bg: '#f1f5f9', color: '#475569', border: '#94a3b8' }
};

const getCategoryStyle = (category) => {
  const cat = (category || 'other').toLowerCase();
  const colors = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other;
  return {
    backgroundColor: colors.bg,
    color: colors.color,
    borderColor: colors.border
  };
};

function Inventory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('name'); // 'name', 'category', 'expiresInDays', 'qty'

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

  // Get unique categories from items
  const categories = useMemo(() => {
    const cats = new Set(items.map(item => item.category || 'other'));
    return ['all', ...Array.from(cats).sort()];
  }, [items]);

  // Filter and sort items
  const filteredAndSortedItems = useMemo(() => {
    let filtered = items;

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(item => (item.category || 'other') === selectedCategory);
    }

    // Sort items
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return (a.name || '').localeCompare(b.name || '');
        case 'category':
          return (a.category || 'other').localeCompare(b.category || 'other');
        case 'expiresInDays':
          return (a.expiresInDays || 999) - (b.expiresInDays || 999);
        case 'qty':
          return (b.qty || 0) - (a.qty || 0);
        default:
          return 0;
      }
    });

    return sorted;
  }, [items, selectedCategory, sortBy]);

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
        <>
          {/* Filter and Sort Controls */}
          <div className={styles.controls}>
            <div className={styles.filterGroup}>
              <label htmlFor="category-filter" className={styles.filterLabel}>Filter by Category:</label>
              <select
                id="category-filter"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className={styles.filterSelect}
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat === 'all' ? 'All Categories' : formatCategory(cat)}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.filterGroup}>
              <label htmlFor="sort-by" className={styles.filterLabel}>Sort by:</label>
              <select
                id="sort-by"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className={styles.filterSelect}
              >
                <option value="name">Name</option>
                <option value="category">Category</option>
                <option value="expiresInDays">Expiration Date</option>
                <option value="qty">Quantity</option>
              </select>
            </div>
          </div>

          {filteredAndSortedItems.length === 0 ? (
            <p className={styles.emptyState}>No items found in this category.</p>
          ) : (
            <div className={styles.grid}>
              {filteredAndSortedItems.map((item) => {
                const categoryStyle = getCategoryStyle(item.category);
                return (
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
                    <div 
                      className={styles.categoryPill}
                      style={categoryStyle}
                    >
                      {formatCategory(item.category)}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default Inventory;
