"use client";

import type { ISODate } from "./dates";
import { refresh, write } from "./db/client";
import type { MealSlot } from "./db/types";
import { missingIngredients } from "./meals";

export async function setMeal(day: ISODate, slot: MealSlot, title: string, mealId: string | null) {
  await write((db) =>
    db.from("meal_plan").upsert({ day, slot, title, meal_id: mealId }, { onConflict: "user_id,day,slot" }),
  );
  await refresh("meal-plan");
}

export async function clearMeal(day: ISODate, slot: MealSlot) {
  await write((db) => db.from("meal_plan").delete().eq("day", day).eq("slot", slot));
  await refresh("meal-plan");
}

export async function saveMeal(meal: { id?: string; name: string; ingredients: string[] }) {
  const row = { name: meal.name, ingredients: meal.ingredients };
  await write((db) => (meal.id ? db.from("meals").update(row).eq("id", meal.id) : db.from("meals").insert(row)));
  await refresh("meals");
}

export async function deleteMeal(id: string) {
  await write((db) => db.from("meals").delete().eq("id", id));
  await refresh("meals", "meal-plan");
}

/** Puts a meal's ingredients on the shopping list, skipping ones already there. */
export async function addIngredientsToShopping(ingredients: string[]) {
  const onList =
    (await write((db) => db.from("list_items").select("title").eq("list", "shopping").eq("status", "open"))) ?? [];
  const toAdd = missingIngredients(
    (onList as { title: string }[]).map((i) => i.title),
    ingredients,
  );
  if (toAdd.length) {
    await write((db) => db.from("list_items").insert(toAdd.map((title) => ({ list: "shopping", title }))));
    await refresh("items:shopping");
  }
  return { added: toAdd.length, skipped: ingredients.length - toAdd.length };
}
