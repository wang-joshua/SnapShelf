import { useEffect, useState } from 'react';
import styles from './RecipeCard.module.css';

function RecipeCard({
  recipe,
  onOpen = () => {}
}) {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const handleClick = () => {
    setShowDetails(true);
    onOpen(recipe);
  };

  const missing = Array.isArray(recipe?.missingIngredients) ? recipe.missingIngredients : [];
  const instructionsPreview =
    typeof recipe?.instructions === 'string' && recipe.instructions
      ? recipe.instructions.slice(0, 180) + (recipe.instructions.length > 180 ? '...' : '')
      : '';

  const formatMeasurement = (ing) => {
    const qty = Number.isFinite(ing?.qty) ? ing.qty : ing?.qty ?? '';
    const unit =
      (typeof ing?.unit === 'string' && ing.unit.trim()) ||
      (typeof ing?.measurement === 'string' && ing.measurement.trim()) ||
      (typeof ing?.qtyUnit === 'string' && ing.qtyUnit.trim()) ||
      'units';
    if (qty === '' || qty === undefined || qty === null) return ing?.name || '';
    return `${ing?.name || ''} (${qty} ${unit})`;
  };

  const ingredientsList = Array.isArray(recipe?.ingredients)
    ? recipe.ingredients.filter((ing) => ing?.name).map((ing) => formatMeasurement(ing))
    : [];

  const formatCategory = (value = '') => {
    const clean = value.trim();
    if (!clean) return 'Uncategorized';
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  };

  const computeHealth = () => {
    const cat = (recipe?.category || '').toLowerCase();
    let score = 60;
    if (cat.includes('salad') || cat.includes('veggie') || cat.includes('produce')) score += 20;
    if (cat.includes('dessert') || cat.includes('snack')) score -= 20;
    if (ingredientsList.some((name) => /fried|sugar|cream/i.test(name))) score -= 15;
    score = Math.max(10, Math.min(100, score));
    const label = score >= 75 ? 'Very healthy' : score >= 50 ? 'Moderate' : 'Indulgent';
    return { score, label };
  };

  const health = computeHealth();

  return (
    <article
      className={styles['recipe-card']}
      onClick={handleClick}
    >
      <div className={styles.cardHeader}>
        <div>
          <h3>{recipe?.title || 'Untitled Recipe'}</h3>
          <p className={styles.meta}>
            {Array.isArray(recipe?.ingredients) ? recipe.ingredients.length : 0} ingredients •{' '}
            {formatCategory(recipe?.category || '')}
          </p>
        </div>
      </div>

      {missing.length > 0 && (
        <p className={styles.missing}>Missing: {missing.map((m) => m.name).join(', ')}</p>
      )}

      {/* Detail modal handled by parent; include quick health and ingredients summary for accessibility */}
      <div className={styles.cardFooter}>
        <div className={styles.healthMeter}>
          <div className={styles.healthLabel}>
            Healthy meter: {health.label} ({health.score}%)
          </div>
          <div className={styles.healthBar}>
            <span style={{ width: `${health.score}%` }} />
          </div>
        </div>
        {instructionsPreview && (
          <p className={styles.instructions}>Recipe: {instructionsPreview}</p>
        )}
      </div>

      {/* Detail modal handled by parent */}
    </article>
  );
}

export default RecipeCard;
