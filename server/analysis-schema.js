import { z } from "zod";
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
