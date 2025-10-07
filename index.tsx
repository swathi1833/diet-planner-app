/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- TypeScript Interfaces ---
interface Meal {
  dishName: string;
  calories: number;
  ingredients: string[];
  instructions: string;
}

interface DayPlan {
  day: string;
  theme?: string; // e.g., "Diwali Special", "Detox Day"
  meals: {
    breakfast: Meal;
    lunch: Meal;
    dinner: Meal;
  };
  totalCalories: number;
}

type DietPlan = DayPlan[];

interface FormData {
  age: string;
  sex: 'Male' | 'Female' | 'Other';
  weight: string;
  height: string;
  allergies: string;
  healthIssues: string[];
  cuisine: 'North Indian' | 'South Indian' | 'East Indian' | 'West Indian' | 'Any';
  foodType: 'Veg' | 'Non-Veg' | 'Eggetarian';
  budget: '100-400' | '400-600' | '600+';
  city: string;
  currentDate: string;
  enableFestivalMode: boolean;
  mealTiming: 'Standard' | 'Early Breakfast' | 'Late Dinner';
  fastingMode: string;
  religion: 'None' | 'Hindu' | 'Muslim' | 'Christian' | 'Jain';
}

interface Store {
  Name: string;
  URL: string;
  Timing: string;
  Address: string;
  Offer: string;
  Ratings: string;
}

// --- Local Storage Keys ---
const USERS_DB_KEY = 'plateiq-users-db';
const AUTH_KEY = 'plateiq-is-logged-in';
const CURRENT_USER_KEY = 'plateiq-current-user';


// --- Religion-Specific Fasting Options ---
const fastingOptionsByReligion: Record<FormData['religion'], string[]> = {
  None: ['None'],
  Hindu: [
    'None',
    'Ekadashi',
    'Navratri',
    'Maha Shivaratri',
    'Pradosh Vrat',
    'Sankashti Chaturthi',
    'Karva Chauth',
    'Somvar (Monday) Vrat',
    'Shanivar (Saturday) Vrat',
    'Amavasya/Purnima',
    'Karthigai Vrat'
  ],
  Muslim: ['None', 'Ramadan', 'Sunnah (Mon/Thu)', 'Ashura', 'Fast of Arafah'],
  Christian: ['None', 'Lent', 'Ash Wednesday', 'Good Friday', 'Fridays in Lent'],
  Jain: ['None', 'Paryushana', 'Ayambil'] 
};


// --- Gemini API Interaction ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const mealSchema = {
    type: Type.OBJECT,
    properties: {
        dishName: { type: Type.STRING },
        calories: { type: Type.NUMBER },
        ingredients: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "List of ingredients with quantities (e.g., '1 cup rice', '200g chicken')."
        },
        instructions: {
            type: Type.STRING,
            description: "Step-by-step recipe instructions."
        }
    },
    required: ["dishName", "calories", "ingredients", "instructions"]
};

const dietPlanSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      day: { type: Type.STRING, description: "Day of the week (e.g., Monday)" },
      theme: { type: Type.STRING, description: "A special theme for the day, like 'Diwali Special' or 'Detox Day'." },
      meals: {
        type: Type.OBJECT,
        properties: {
          breakfast: mealSchema,
          lunch: mealSchema,
          dinner: mealSchema,
        },
        required: ["breakfast", "lunch", "dinner"]
      },
      totalCalories: { type: Type.NUMBER, description: "Total calories for the day." }
    },
    required: ["day", "meals", "totalCalories"]
  }
};

const storeSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      Name: { type: Type.STRING },
      URL: { type: Type.STRING },
      Timing: { type: Type.STRING },
      Address: { type: Type.STRING },
      Offer: { type: Type.STRING },
      Ratings: { type: Type.STRING }
    },
    required: ["Name", "URL", "Timing", "Address", "Offer", "Ratings"]
  }
};

async function generateDietPlan(formData: FormData): Promise<DietPlan> {
  const healthIssuesText = formData.healthIssues.length > 0 ? formData.healthIssues.join(', ') : 'None';
  
  let prompt = `
    You are an expert Indian nutritionist. Create a customized 7-day diet plan based on the following user details:
    - Age: ${formData.age} years
    - Sex: ${formData.sex}
    - Weight: ${formData.weight} kg
    - Height: ${formData.height} cm
    - Health Issues: ${healthIssuesText}
    - Religion: ${formData.religion}
    - Food Allergies or restrictions: ${formData.allergies || 'None'}
    - Preferred Cuisine: ${formData.cuisine}
    - Food Type: ${formData.foodType}
    - Daily Budget: ${formData.budget} INR
    - Location (City): ${formData.city}
    - Meal Timing Preference: ${formData.mealTiming}
  `;

  if (formData.fastingMode !== 'None') {
    prompt += `\n- Fasting Mode: The user is observing ${formData.fastingMode}. Create a plan that respects this fast, including appropriate nutrient-rich meals for feasting and fasting periods.`;
  }
  
  if (formData.fastingMode !== 'None' && formData.religion !== 'None') {
      prompt += `\n\n--- IMPORTANT: RELIGIOUS DIETARY & FASTING RULES ---\n`;
      prompt += `The user is observing a fast as per their ${formData.religion} faith. You MUST adhere to the following specific rules for the recipes on fasting days:\n`;

      switch (formData.religion) {
        case 'Hindu':
          prompt += `
            - For Hindu fasts like Ekadashi or Navratri: Avoid grains and pulses (rice, wheat, lentils, beans).
            - Also avoid onion, garlic, meat, eggs, and alcohol.
            - Focus on fruits, dairy, rock salt (sendha namak), and specific non-grain flours like water chestnut flour (singhare ka atta) or buckwheat flour (kuttu ka atta).`;
          break;
        case 'Muslim':
          prompt += `
            - All meals MUST be Halal. This means no pork, no alcohol, and only halal-slaughtered meat.
            - For Ramadan, the plan should have a 'Suhoor' (pre-dawn meal) and 'Iftar' (post-sunset meal).
            - Suhoor meals should be hydrating and provide sustained energy. Avoid very oily or spicy foods.
            - Iftar should start with something light like dates and water, followed by a balanced meal.`;
          break;
        case 'Christian':
          prompt += `
            - For Christian fasts like Lent (especially on Fridays, Ash Wednesday, Good Friday): Abstain from meat (from warm-blooded animals).
            - Fish is typically allowed. Dairy and eggs are generally allowed.`;
          break;
        case 'Jain':
          prompt += `
            - The diet must be strictly lacto-vegetarian.
            - Absolutely NO root/underground vegetables (potato, onion, garlic, carrots, radish, beets, etc.).
            - Avoid mushrooms, fungi, and honey.
            - Suggest meals that can be consumed before sunset. During special fasts like Paryushana, the food should be even simpler.`;
          break;
      }
      prompt += `\n------------------------------------------------------\n`;
    } else if (formData.religion === 'Muslim') {
        prompt += `\n- Note: As the user is Muslim, ensure all non-vegetarian dishes use Halal meat and avoid pork and alcohol entirely in all recipes.\n`
    } else if (formData.religion === 'Jain') {
        prompt += `\n- Note: As the user is Jain, the diet must be strictly lacto-vegetarian and MUST NOT contain any root vegetables (potato, onion, garlic, etc.) or mushrooms in any recipes.\n`
    }


  if (formData.enableFestivalMode) {
    prompt += `\n- Festival Mode is ON. The current date is ${formData.currentDate}. 
      - Check if any major Indian festivals (like Diwali, Eid, Navratri, Pongal, Onam) are occurring in the next 7 days in the user's region.
      - If a festival is detected, adjust the meal plan for that day to include special festive dishes that are healthier than the traditional versions (e.g., baked snacks, low-fat sweets, millet-based dishes). Add a "theme" to that day's plan (e.g., "Diwali Special").
      - After the festival day(s), include a one-day 'Post-Festival Detox' plan with lighter, restorative meals. Add the theme "Detox Day" to this day.`;
  }

  prompt += `

    Generate a complete 7-day plan. For each day, provide a breakfast, lunch, and dinner meal.
    The diet plan MUST be suitable for the specified health issues and religious constraints.
    For each meal, include the dish name, a list of ingredients with quantities, simple step-by-step instructions, and the estimated calorie count.
    Also, provide the total estimated calories for each day.
    The plan should be healthy, balanced, and suitable for the user's profile.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: dietPlanSchema,
    },
  });

  try {
    const jsonText = response.text.trim();
    return JSON.parse(jsonText);
  } catch (e) {
    console.error("Failed to parse JSON response:", e, "Raw text:", response.text);
    throw new Error("The diet plan returned an unexpected format. Please try again.");
  }
}

async function findGroceryStores(city: string): Promise<Store[]> {
  const prompt = `Find a list of 3-5 popular BigBasket stores in ${city}. Provide their name, a valid URL, timings, address, a current offer, and ratings.`;
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: storeSchema,
    },
  });
  try {
    const jsonText = response.text.trim();
    return JSON.parse(jsonText);
  } catch (e) {
    console.error("Failed to parse JSON response:", e, "Raw text:", response.text);
    throw new Error("Could not find store information in the right format. Please try again.");
  }
}

// --- React Components ---

const SavedRecipesModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  recipes: Meal[];
  onRemove: (dishName: string) => void;
}> = ({ isOpen, onClose, recipes, onRemove }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>My Saved Recipes</h3>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {recipes.length > 0 ? (
            <div className="saved-recipes-list">
              {recipes.map((meal) => (
                <div key={meal.dishName} className="saved-recipe-card">
                  <div className="saved-recipe-header">
                    <h4>{meal.dishName}</h4>
                    <button onClick={() => onRemove(meal.dishName)} className="remove-recipe-btn">Remove</button>
                  </div>
                  <div className="recipe-details">
                    <h5>Ingredients</h5>
                    <ul>{meal.ingredients.map((ing, i) => <li key={i}>{ing}</li>)}</ul>
                    <h5>Instructions</h5>
                    <p>{meal.instructions}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>You haven't saved any recipes yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};

const StoreModal: React.FC<{ isOpen: boolean, onClose: () => void, isLoading: boolean, error: string | null, stores: Store[] | null }> = ({ isOpen, onClose, isLoading, error, stores }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Grocery Stores Nearby</h3>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {isLoading && <div className="spinner"></div>}
          {error && <p className="error-text">{error}</p>}
          {stores && stores.length > 0 && (
            <div className="stores-list">
              {stores.map((store, index) => (
                <div key={index} className="store-card">
                  <h4>{store.Name} ({store.Ratings} ★)</h4>
                  <p><strong>Address:</strong> {store.Address}</p>
                  <p><strong>Timings:</strong> {store.Timing}</p>
                  <p><strong>Offer:</strong> {store.Offer}</p>
                  <a href={store.URL} target="_blank" rel="noopener noreferrer">Visit Store</a>
                </div>
              ))}
            </div>
          )}
           {stores && stores.length === 0 && <p>No stores found for this city.</p>}
        </div>
      </div>
    </div>
  );
};

const App: React.FC<{ currentUser: string; onLogout: () => void }> = ({ currentUser, onLogout }) => {
    // User-specific local storage keys
    const USER_PROFILE_KEY = `plateiq-user-profile-${currentUser}`;
    const SAVED_RECIPES_KEY = `plateiq-saved-recipes-${currentUser}`;

    const getTodayDateString = () => new Date().toISOString().split('T')[0];

    const initialFormData: FormData = {
      age: '',
      sex: 'Female',
      weight: '',
      height: '',
      allergies: '',
      healthIssues: [],
      cuisine: 'North Indian',
      foodType: 'Veg',
      budget: '400-600',
      city: '',
      currentDate: getTodayDateString(),
      enableFestivalMode: false,
      mealTiming: 'Standard',
      fastingMode: 'None',
      religion: 'None',
    };
  
  const [formData, setFormData] = useState<FormData>(() => {
    try {
      const savedData = localStorage.getItem(USER_PROFILE_KEY);
      if (savedData) {
        const parsed = JSON.parse(savedData) as Partial<FormData>;
        return { ...initialFormData, ...parsed, healthIssues: parsed.healthIssues || [], currentDate: parsed.currentDate || getTodayDateString(), fastingMode: 'None' };
      }
    } catch (error) {
      console.error("Failed to load user profile from local storage", error);
    }
    return initialFormData;
  });

  const [dietPlan, setDietPlan] = useState<DietPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState(0);
  
  const [stores, setStores] = useState<Store[] | null>(null);
  const [isStoreLoading, setIsStoreLoading] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);

  const [savedRecipes, setSavedRecipes] = useState<Meal[]>([]);
  const [isSavedRecipesModalOpen, setIsSavedRecipesModalOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVED_RECIPES_KEY);
      if (saved) {
        setSavedRecipes(JSON.parse(saved));
      } else {
        setSavedRecipes([]); // Clear recipes for new user
      }
    } catch (error) {
      console.error("Failed to load saved recipes", error);
    }
  }, [currentUser, SAVED_RECIPES_KEY]);

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_RECIPES_KEY, JSON.stringify(savedRecipes));
    } catch (error) {
      console.error("Failed to save recipes", error);
    }
  }, [savedRecipes, SAVED_RECIPES_KEY]);


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    if (name === 'religion') {
      setFormData(prev => ({ 
        ...prev, 
        religion: value as FormData['religion'], 
        fastingMode: 'None' 
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: checked }));
  };


  const handleHealthIssueChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedOptions = Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value);
    setFormData(prev => ({ ...prev, healthIssues: selectedOptions }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setDietPlan(null);

    try {
      const result = await generateDietPlan(formData);
      setDietPlan(result);
      localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(formData));
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFindStores = async () => {
    setIsStoreModalOpen(true);
    setIsStoreLoading(true);
    setStoreError(null);
    setStores(null);

    try {
      const result = await findGroceryStores(formData.city);
      setStores(result);
    } catch (err) {
      setStoreError(err instanceof Error ? err.message : "Could not fetch store data.");
    } finally {
      setIsStoreLoading(false);
    }
  }

  const handleSaveRecipe = (mealToSave: Meal) => {
    setSavedRecipes(prev => {
      if (prev.some(recipe => recipe.dishName === mealToSave.dishName)) {
        return prev;
      }
      return [...prev, mealToSave];
    });
  };

  const handleRemoveRecipe = (dishNameToRemove: string) => {
    setSavedRecipes(prev => prev.filter(recipe => recipe.dishName !== dishNameToRemove));
  };


  const resetForm = () => {
    setDietPlan(null);
    setError(null);
    setStores(null);
    setStoreError(null);
    setIsStoreModalOpen(false);
    const savedProfile = localStorage.getItem(USER_PROFILE_KEY);
    const baseState = savedProfile ? JSON.parse(savedProfile) : {};
    setFormData({ ...initialFormData, ...baseState });
  }

  const MealCard: React.FC<{ mealType: 'Breakfast' | 'Lunch' | 'Dinner', meal: Meal, onSave: (meal: Meal) => void, isSaved: boolean }> = ({ mealType, meal, onSave, isSaved }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const mealIcons = {
      Breakfast: '☀️',
      Lunch: ' B',
      Dinner: '🌙',
    };

    return (
      <div className="meal-card">
        <div className="meal-header">
          <div>
            <h4>{mealIcons[mealType]} {mealType}</h4>
            <p>{meal.dishName}</p>
          </div>
          <span className="calories">{meal.calories.toFixed(0)} Cal</span>
        </div>
        <div className="meal-actions">
           <button className="recipe-toggle" onClick={() => setIsExpanded(!isExpanded)}>
             {isExpanded ? 'Hide Recipe' : 'Show Recipe'}
           </button>
            <button className="save-recipe-btn" onClick={() => onSave(meal)} disabled={isSaved}>
              {isSaved ? 'Saved ✔️' : 'Save Recipe'}
            </button>
        </div>
        {isExpanded && (
          <div className="recipe-details">
            <h5>Ingredients</h5>
            <ul>
              {meal.ingredients.map((ing, i) => <li key={i}>{ing}</li>)}
            </ul>
            <h5>Instructions</h5>
            <p>{meal.instructions}</p>
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="app-container">
        <div className="loading-view">
          <div className="spinner"></div>
          <p>Generating your personalized diet plan...</p>
          <p>This might take a moment.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-container">
        <div className="error-view">
          <h3>Something went wrong</h3>
          <p>{error}</p>
          <button className="btn" onClick={resetForm}>Try Again</button>
        </div>
      </div>
    );
  }

  if (dietPlan) {
    const currentDay = dietPlan[activeDay];
    return (
      <div className="app-container">
         <StoreModal 
          isOpen={isStoreModalOpen} 
          onClose={() => setIsStoreModalOpen(false)} 
          isLoading={isStoreLoading} 
          error={storeError} 
          stores={stores} 
        />
         <SavedRecipesModal 
          isOpen={isSavedRecipesModalOpen} 
          onClose={() => setIsSavedRecipesModalOpen(false)}
          recipes={savedRecipes}
          onRemove={handleRemoveRecipe}
        />
        <header>
          <h1>Your 7-Day Diet Plan</h1>
          <div className="header-actions">
            <button className="btn text-btn" onClick={() => setIsSavedRecipesModalOpen(true)}>
              My Saved Recipes ({savedRecipes.length})
            </button>
            <button className="btn text-btn" onClick={onLogout}>
              Logout
            </button>
          </div>
        </header>
        <main className="plan-view">
          <div className="day-tabs">
            {dietPlan.map((day, index) => (
              <button
                key={index}
                className={`tab ${index === activeDay ? 'active' : ''}`}
                onClick={() => setActiveDay(index)}
              >
                {day.day.substring(0, 3)}
              </button>
            ))}
          </div>
          <div className="plan-content">
            <div className="day-header">
              <h2>{currentDay.day}</h2>
              {currentDay.theme && <span className="day-theme">{currentDay.theme}</span>}
              <div className="total-calories">Total: <span>{currentDay.totalCalories.toFixed(0)} Cal</span></div>
            </div>
            <div className="meals-grid">
              <MealCard mealType="Breakfast" meal={currentDay.meals.breakfast} onSave={handleSaveRecipe} isSaved={savedRecipes.some(r => r.dishName === currentDay.meals.breakfast.dishName)} />
              <MealCard mealType="Lunch" meal={currentDay.meals.lunch} onSave={handleSaveRecipe} isSaved={savedRecipes.some(r => r.dishName === currentDay.meals.lunch.dishName)}/>
              <MealCard mealType="Dinner" meal={currentDay.meals.dinner} onSave={handleSaveRecipe} isSaved={savedRecipes.some(r => r.dishName === currentDay.meals.dinner.dishName)}/>
            </div>
          </div>
          <div className="plan-actions">
            <button className="btn" onClick={resetForm}>Create a New Plan</button>
            <button className="btn accent-btn" onClick={handleFindStores}>Shop for Groceries</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header>
        <h1>🍽️ PLATEIQ</h1>
        <p>Your Personal Indian Diet Planner</p>
         <div className="header-actions">
            <button className="btn text-btn" onClick={() => setIsSavedRecipesModalOpen(true)} disabled={savedRecipes.length === 0}>
                My Saved Recipes ({savedRecipes.length})
            </button>
            <button className="btn text-btn" onClick={onLogout}>
              Logout
            </button>
         </div>
      </header>
       <SavedRecipesModal 
          isOpen={isSavedRecipesModalOpen} 
          onClose={() => setIsSavedRecipesModalOpen(false)}
          recipes={savedRecipes}
          onRemove={handleRemoveRecipe}
        />
      <main>
        <form onSubmit={handleSubmit} className="form-container">
          <div className="form-grid">
            {/* Personal Details */}
            <div className="form-group">
              <label htmlFor="age">Age</label>
              <input type="number" id="age" name="age" value={formData.age} onChange={handleInputChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="sex">Sex</label>
              <select id="sex" name="sex" value={formData.sex} onChange={handleInputChange}>
                <option>Female</option> <option>Male</option> <option>Other</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="weight">Weight (kg)</label>
              <input type="number" id="weight" name="weight" value={formData.weight} onChange={handleInputChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="height">Height (cm)</label>
              <input type="number" id="height" name="height" value={formData.height} onChange={handleInputChange} required />
            </div>
             <div className="form-group full-width">
               <label htmlFor="city">City for location-based suggestions</label>
               <input type="text" id="city" name="city" value={formData.city} onChange={handleInputChange} placeholder="e.g., Mumbai" required />
            </div>

            {/* Health & Preferences */}
            <div className="form-group full-width">
              <label htmlFor="allergies">Allergies (e.g., nuts, dairy)</label>
              <input type="text" id="allergies" name="allergies" value={formData.allergies} onChange={handleInputChange} placeholder="Leave blank if none" />
            </div>
            <div className="form-group full-width">
              <label htmlFor="healthIssues">Health Issues (Ctrl/Cmd + click to select multiple)</label>
              <select id="healthIssues" name="healthIssues" multiple value={formData.healthIssues} onChange={handleHealthIssueChange}>
                <option value="Diabetes">Diabetes</option>
                <option value="High Blood Pressure">High Blood Pressure</option>
                <option value="PCOS">PCOS</option>
                <option value="Thyroid">Thyroid</option>
                <option value="High Cholesterol">High Cholesterol</option>
              </select>
            </div>
             <div className="form-group">
              <label htmlFor="religion">Religion (for fasting/dietary customs)</label>
              <select id="religion" name="religion" value={formData.religion} onChange={handleInputChange}>
                <option value="None">None</option>
                <option value="Hindu">Hindu</option>
                <option value="Muslim">Muslim</option>
                <option value="Christian">Christian</option>
                <option value="Jain">Jain</option>
              </select>
            </div>
             <div className="form-group">
              <label htmlFor="fastingMode">Fasting Mode</label>
              <select id="fastingMode" name="fastingMode" value={formData.fastingMode} onChange={handleInputChange}>
                {(fastingOptionsByReligion[formData.religion] || ['None']).map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="foodType">Food Type</label>
              <select id="foodType" name="foodType" value={formData.foodType} onChange={handleInputChange}>
                <option>Veg</option> <option>Non-Veg</option> <option>Eggetarian</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="cuisine">Cuisine</label>
              <select id="cuisine" name="cuisine" value={formData.cuisine} onChange={handleInputChange}>
                <option>North Indian</option> <option>South Indian</option> <option>East Indian</option> <option>West Indian</option> <option>Any</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="budget">Budget per day (INR)</label>
              <select id="budget" name="budget" value={formData.budget} onChange={handleInputChange}>
                <option>100-400</option> <option>400-600</option> <option>600+</option>
              </select>
            </div>

             {/* Lifestyle & Festival Settings */}
            <div className="form-group">
              <label htmlFor="mealTiming">Meal Timing</label>
              <select id="mealTiming" name="mealTiming" value={formData.mealTiming} onChange={handleInputChange}>
                <option>Standard</option>
                <option>Early Breakfast</option>
                <option>Late Dinner</option>
              </select>
            </div>
           
             <div className="form-group">
                <label htmlFor="currentDate">Date for Plan</label>
                <input type="date" id="currentDate" name="currentDate" value={formData.currentDate} onChange={handleInputChange} required />
            </div>
            <div className="form-group toggle-group">
                <label htmlFor="enableFestivalMode">Festival Mode</label>
                <label className="switch">
                    <input type="checkbox" id="enableFestivalMode" name="enableFestivalMode" checked={formData.enableFestivalMode} onChange={handleCheckboxChange} />
                    <span className="slider round"></span>
                </label>
            </div>
          </div>
          <button type="submit" className="btn submit-btn" disabled={isLoading}>
            Generate My Plan
          </button>
        </form>
      </main>
    </div>
  );
};

const AuthPage: React.FC<{ onAuthSuccess: (email: string) => void }> = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleToggleMode = () => {
    setMode(prev => (prev === 'login' ? 'signup' : 'login'));
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password || (mode === 'signup' && !name)) {
      setError('Please fill in all fields.');
      return;
    }
    
    if (!/\S+@\S+\.\S+/.test(email)) {
        setError('Please enter a valid email address.');
        return;
    }

    const usersDb = JSON.parse(localStorage.getItem(USERS_DB_KEY) || '{}');

    if (mode === 'signup') {
      if (usersDb[email]) {
        setError('An account with this email already exists. Please log in.');
        return;
      }
      usersDb[email] = { name, password };
      localStorage.setItem(USERS_DB_KEY, JSON.stringify(usersDb));
      onAuthSuccess(email);
    } else {
      const user = usersDb[email];
      if (!user) {
        setError('No account found with this email. Please sign up.');
        return;
      }
      if (user.password !== password) {
        setError('Incorrect password. Please try again.');
        return;
      }
      onAuthSuccess(email);
    }
  };

  return (
    <div className="auth-container">
      <header>
        <h1>🍽️ PLATEIQ</h1>
        <p>Your Personal Indian Diet Planner</p>
      </header>
      <main className="auth-card">
        <h2>{mode === 'login' ? 'Welcome Back!' : 'Create Your Account'}</h2>
        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'signup' && (
            <div className="form-group">
              <label htmlFor="name">Name</label>
              <input 
                type="text" 
                id="name" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                required 
              />
            </div>
          )}
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input 
              type="email" 
              id="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input 
              type="password" 
              id="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" className="btn submit-btn">
            {mode === 'login' ? 'Login' : 'Sign Up'}
          </button>
        </form>
        <div className="auth-toggle">
          <button onClick={handleToggleMode} className="btn text-btn">
            {mode === 'login' ? "Don't have an account? Sign Up" : 'Already have an account? Login'}
          </button>
        </div>
      </main>
    </div>
  );
};

const Root: React.FC = () => {
    const [isLoggedIn, setIsLoggedIn] = useState(() => {
        return localStorage.getItem(AUTH_KEY) === 'true';
    });
    const [currentUser, setCurrentUser] = useState<string | null>(() => {
        return localStorage.getItem(CURRENT_USER_KEY);
    });

    const handleAuthSuccess = (email: string) => {
        localStorage.setItem(AUTH_KEY, 'true');
        localStorage.setItem(CURRENT_USER_KEY, email);
        setIsLoggedIn(true);
        setCurrentUser(email);
    };

    const handleLogout = () => {
        localStorage.removeItem(AUTH_KEY);
        localStorage.removeItem(CURRENT_USER_KEY);
        setIsLoggedIn(false);
        setCurrentUser(null);
    };

    return (
      <>
        {isLoggedIn && currentUser ? (
          <App currentUser={currentUser} onLogout={handleLogout} />
        ) : (
          <AuthPage onAuthSuccess={handleAuthSuccess} />
        )}
      </>
    );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<Root />);
