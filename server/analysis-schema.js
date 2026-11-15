import { z } from "zod";
import { NUTRIENTS } from '../nutrition.js';
const number = z.number().finite().nonnegative().max(100000).nullable();
export const foodSchema = z.object({
  name: z.string().max(90).nullable(),
  kcal: z.number().finite().nonnegative().max(9000).nullable(),
  nutrients: z.object(
    Object.fromEntries(
      [
        "carb",
        "protein",
        "fat",
        "fiber",
        "calcium",
        "iron",
        "vitD",
        "vitC",
        "potassium",
        "sodium",
        "satFat",
      ].map((key) => [key, number]),
    ),
  ),
  notes: z.string().max(600),
});
export const exerciseSchema = z.object({
  type: z.string().max(75).nullable(),
  minutes: number,
  calories: number,
  notes: z.string().max(600),
});
export const mealSchema = z.object({
  items: z.array(z.object({
    name: z.string().min(1).max(90),
    kcal: z.number().finite().nonnegative().max(9000).nullable(),
    grams: z.number().finite().positive().max(10000).nullable(),
    nutrients: z.object(Object.fromEntries(NUTRIENTS.map(n=>[n.id,number]))),
  })).max(12),
  notes: z.string().max(600),
});
export const weightSchema = z.object({
  kg: z.number().finite().positive().max(1000).nullable(),
  notes: z.string().max(600),
});
