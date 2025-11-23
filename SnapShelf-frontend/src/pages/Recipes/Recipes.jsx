import { useEffect, useState, useCallback } from 'react';
import {
  getAllRecipes,
  getRecipeRecommendations,
  addMissingToGrocery,
  generateRecipes
} from '../../api/recipes.js';
import RecipeCard from '../../components/RecipeCard.jsx';
import styles from './Recipes.module.css';

function Recipes() {
  const [recipes, setRecipes] = useState([]);
  const [fullyMakeable, setFullyMakeable] = useState([]);
  const [almostMakeable, setAlmostMakeable] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState('');
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [adding, setAdding] = useState(false);

  const loadRecipes = useCallback(async () => {
    try {
      setError('');
      setLoading(true);
      const { data } = await getAllRecipes();
      setRecipes(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err?.response?.data?.error || 'Failed to load recipes';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  const loadRecommendations = useCallback(async () => {
    try {
      setError('');
      const { data } = await getRecipeRecommendations();
      const fm = Array.isArray(data?.fullyMakeable) ? data.fullyMakeable : [];
      const am = Array.isArray(data?.almostMakeable) ? data.almostMakeable : [];
      setFullyMakeable(fm);
      setAlmostMakeable(am);
    } catch (err) {
      const message = err?.response?.data?.error || 'Failed to load recommendations';
      setError(message);
    }
  }, []);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  const handleRefreshAll = async () => {
    try {
      setBanner('');
      setError('');
      setLoading(true);
      await generateRecipes();
      await Promise.all([loadRecipes(), loadRecommendations()]);
      setBanner('Generated fresh recipes from your current fridge items.');
    } catch (err) {
      const message = err?.response?.data?.error || 'Failed to regenerate recipes';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMissing = async (recipe) => {
    const missing = Array.isArray(recipe?.missingIngredients) ? recipe.missingIngredients : [];
    if (!missing.length) return;
    try {
      setAdding(true);
      setError('');
      setBanner('');
      await addMissingToGrocery({
        recipeId: recipe.recipeId || recipe._id,
        missingIngredients: missing
      });
      setBanner('Missing ingredients added to your grocery list!');
    } catch (err) {
      const message = err?.response?.data?.error || 'Failed to add missing ingredients';
      setError(message);
    } finally {
      setAdding(false);
    }
  };

  const closeModal = () => setActiveRecipe(null);

  return (
    <section className={styles.container}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Recipes</p>
          <h1>Browse Recipes</h1>
        </div>
        <button type="button" className={styles.refreshButton} onClick={handleRefreshAll} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      {banner && <p className={styles.success}>{banner}</p>}
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.subHeader}>
        <h2>Can Make Now</h2>
      </div>
      {loading ? (
        <p>Loading recommendations...</p>
      ) : fullyMakeable.length === 0 ? (
        <p>No fully makeable recipes right now.</p>
      ) : (
        <div className={styles.grid}>
          {fullyMakeable.map((recipe) => (
            <RecipeCard key={recipe.recipeId || recipe._id} recipe={recipe} onOpen={setActiveRecipe} />
          ))}
        </div>
      )}

      <div className={styles.subHeader}>
        <h2>May Need More Ingredients</h2>
      </div>
      {loading ? (
        <p>Loading recommendations...</p>
      ) : almostMakeable.length === 0 ? (
        <p>No almost-makeable recipes found.</p>
      ) : (
        <div className={styles.grid}>
          {almostMakeable.map((recipe) => (
            <RecipeCard key={recipe.recipeId || recipe._id} recipe={recipe} onOpen={setActiveRecipe} />
          ))}
        </div>
      )}

      {activeRecipe && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>{activeRecipe.title}</h2>
                <p className={styles.metaLine}>
                  {(activeRecipe.ingredients || []).length} ingredients •{' '}
                  {((activeRecipe.category || 'Uncategorized').charAt(0).toUpperCase() + (activeRecipe.category || 'Uncategorized').slice(1))}
                </p>
              </div>
              <button type="button" className={styles.closeButton} onClick={closeModal}>
                Close
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.section}>
                <h4>Description</h4>
                <p>{activeRecipe.description || 'No description available.'}</p>
                {activeRecipe.instructions && (
                  <>
                    <h4>Instructions</h4>
                    <p>{activeRecipe.instructions}</p>
                  </>
                )}
                {(activeRecipe.ingredients || []).length > 0 && (
                  <>
                    <h4>Ingredients</h4>
                    <ul className={styles.ingredientsList}>
                      {activeRecipe.ingredients.map((ing, idx) => (
                        <li key={`${activeRecipe._id || activeRecipe.recipeId}-${idx}`}>
                          {ing.name} —{' '}
                          {Number.isFinite(ing.qty)
                            ? `${ing.qty} ${
                                (typeof ing.unit === 'string' && ing.unit.trim()) ||
                                (typeof ing.measurement === 'string' && ing.measurement.trim()) ||
                                (typeof ing.qtyUnit === 'string' && ing.qtyUnit.trim()) ||
                                'units'
                              }`
                            : 'qty not specified'}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {Array.isArray(activeRecipe.missingIngredients) && activeRecipe.missingIngredients.length > 0 && (
                  <div className={styles.missingBlock}>
                    <h4>Missing Ingredients</h4>
                    <ul className={styles.ingredientsList}>
                      {activeRecipe.missingIngredients.map((m) => (
                        <li key={`${activeRecipe._id || activeRecipe.recipeId}-${m.name}`}>
                          {m.name} — need {m.qtyNeeded}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className={styles.addButton}
                      onClick={() => handleAddMissing(activeRecipe)}
                      disabled={adding}
                    >
                      Add missing items to grocery list
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default Recipes;
