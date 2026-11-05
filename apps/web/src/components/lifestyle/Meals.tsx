"use client";

import { useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Label, List, Note, Row, Section, Sheet, TextButton, TextField } from "@/components/ui";
import { addDays, fromISODate, startOfWeek, type ISODate } from "@/lib/dates";
import { useMealPlan, useMeals } from "@/lib/db/hooks";
import type { Meal, MealPlanEntry, MealSlot } from "@/lib/db/types";
import { addIngredientsToShopping, clearMeal, deleteMeal, saveMeal, setMeal } from "@/lib/meal-actions";
import { parseIngredients } from "@/lib/meals";
import styles from "./lifestyle.module.css";

const SLOTS: MealSlot[] = ["lunch", "dinner"];
const dayName = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const range = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

type SlotSheet = { day: ISODate; slot: MealSlot; entry: MealPlanEntry | null } | null;

export function Meals({ today }: { today: ISODate }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const week = addDays(startOfWeek(today), weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const plan = useMealPlan(week, days[6]);
  const meals = useMeals();
  const [slotSheet, setSlotSheet] = useState<SlotSheet>(null);
  const [mealSheet, setMealSheet] = useState<Meal | "new" | null>(null);

  const entry = (day: ISODate, slot: MealSlot) => plan.data.find((e) => e.day === day && e.slot === slot) ?? null;

  return (
    <>
      <div className={styles.stepper}>
        <button type="button" className={styles.iconButton} aria-label="Previous week" onClick={() => setWeekOffset((w) => w - 1)}>
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <p className={styles.stepperLabel}>
          {weekOffset === 0 ? "This week" : weekOffset === 1 ? "Next week" : `${range.format(fromISODate(week))} – ${range.format(fromISODate(days[6]))}`}
        </p>
        <button type="button" className={styles.iconButton} aria-label="Next week" onClick={() => setWeekOffset((w) => w + 1)}>
          <ChevronRight size={20} strokeWidth={1.8} />
        </button>
      </div>

      <div className={styles.mealWeek}>
        {days.map((day) => (
          <div key={day} className={styles.mealDay} data-today={day === today || undefined}>
            <div className={styles.mealDayName}>
              <span>{dayName.format(fromISODate(day))}</span>
              <span className={styles.mealDayNumber}>{Number(day.slice(8))}</span>
            </div>
            <div className={styles.mealSlots}>
              {SLOTS.map((slot) => {
                const current = entry(day, slot);
                return (
                  <button
                    key={slot}
                    type="button"
                    className={styles.mealSlot}
                    onClick={() => setSlotSheet({ day, slot, entry: current })}
                  >
                    <span className={styles.slotLabel}>{slot === "lunch" ? "Lunch" : "Dinner"}</span>
                    <span className={current ? styles.slotMeal : styles.slotEmpty}>{current?.title ?? "Add"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Section title="Saved meals">
        {meals.loaded && meals.data.length === 0 && (
          <Note>Meals you make often, with their ingredients, so planning one can fill the shopping list.</Note>
        )}
        {meals.data.length > 0 && (
          <List>
            {meals.data.map((meal) => (
              <Row
                key={meal.id}
                title={meal.name}
                detail={meal.ingredients.length ? meal.ingredients.join(", ") : "No ingredients"}
                onClick={() => setMealSheet(meal)}
              />
            ))}
          </List>
        )}
        <div className={styles.spaced}>
          <TextButton onClick={() => setMealSheet("new")}>New meal</TextButton>
        </div>
      </Section>

      <Sheet
        open={slotSheet !== null}
        onClose={() => setSlotSheet(null)}
        title={slotSheet ? `${slotSheet.slot === "lunch" ? "Lunch" : "Dinner"} · ${dayName.format(fromISODate(slotSheet.day))} ${Number(slotSheet.day.slice(8))}` : ""}
      >
        {slotSheet && (
          <SlotForm key={`${slotSheet.day}-${slotSheet.slot}`} sheet={slotSheet} meals={meals.data} onDone={() => setSlotSheet(null)} />
        )}
      </Sheet>

      <Sheet open={mealSheet !== null} onClose={() => setMealSheet(null)} title={mealSheet === "new" ? "New meal" : "Edit meal"}>
        {mealSheet !== null && (
          <MealForm key={mealSheet === "new" ? "new" : mealSheet.id} meal={mealSheet === "new" ? null : mealSheet} onDone={() => setMealSheet(null)} />
        )}
      </Sheet>
    </>
  );
}

function SlotForm({ sheet, meals, onDone }: { sheet: NonNullable<SlotSheet>; meals: Meal[]; onDone: () => void }) {
  const [title, setTitle] = useState(sheet.entry?.title ?? "");
  const [picked, setPicked] = useState<Meal | null>(meals.find((m) => m.id === sheet.entry?.meal_id) ?? null);
  const [addToShopping, setAddToShopping] = useState(!sheet.entry);
  const [result, setResult] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    const name = title.trim();
    if (!name) return;
    const meal = picked && picked.name === name ? picked : (meals.find((m) => m.name.toLowerCase() === name.toLowerCase()) ?? null);
    await setMeal(sheet.day, sheet.slot, name, meal?.id ?? null);
    if (meal && addToShopping && meal.ingredients.length) {
      const { added } = await addIngredientsToShopping(meal.ingredients);
      setResult(added ? `Added ${added} to the shopping list.` : "Everything’s already on the shopping list.");
      setTimeout(onDone, 1200);
      return;
    }
    onDone();
  }

  const matching = meals.filter((m) => !title || m.name.toLowerCase().includes(title.toLowerCase())).slice(0, 6);
  const chosen = picked && picked.name === title ? picked : null;

  return (
    <form className={styles.form} onSubmit={save}>
      <TextField
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setPicked(null);
        }}
        placeholder="What are you having?"
        aria-label="Meal"
        autoFocus={!sheet.entry}
      />
      {matching.length > 0 && !chosen && (
        <List>
          {matching.map((meal) => (
            <Row
              key={meal.id}
              title={meal.name}
              detail={meal.ingredients.length ? `${meal.ingredients.length} ingredients` : undefined}
              onClick={() => {
                setTitle(meal.name);
                setPicked(meal);
              }}
            />
          ))}
        </List>
      )}
      {chosen && chosen.ingredients.length > 0 && (
        <label className={styles.toggle}>
          <input type="checkbox" checked={addToShopping} onChange={(e) => setAddToShopping(e.target.checked)} />
          Add its {chosen.ingredients.length} ingredients to the shopping list
        </label>
      )}
      {result && <Note>{result}</Note>}
      <div className={styles.actions}>
        {sheet.entry ? (
          <TextButton
            onClick={async () => {
              await clearMeal(sheet.day, sheet.slot);
              onDone();
            }}
          >
            Remove
          </TextButton>
        ) : (
          <span />
        )}
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}

function MealForm({ meal, onDone }: { meal: Meal | null; onDone: () => void }) {
  const [name, setName] = useState(meal?.name ?? "");
  const [ingredients, setIngredients] = useState(meal?.ingredients.join("\n") ?? "");

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    await saveMeal({ id: meal?.id, name: name.trim(), ingredients: parseIngredients(ingredients) });
    onDone();
  }

  return (
    <form className={styles.form} onSubmit={save}>
      <Label text="Name">
        <TextField value={name} onChange={(e) => setName(e.target.value)} placeholder="Chilli con carne" autoFocus={!meal} required />
      </Label>
      <Label text="Ingredients, one per line">
        <textarea
          className={styles.textarea}
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          rows={6}
          placeholder={"Minced beef\nKidney beans\nChopped tomatoes\nRice"}
        />
      </Label>
      <div className={styles.actions}>
        {meal ? (
          <TextButton
            onClick={async () => {
              await deleteMeal(meal.id);
              onDone();
            }}
          >
            Delete meal
          </TextButton>
        ) : (
          <span />
        )}
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
