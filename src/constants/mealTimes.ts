export const MEAL_TIMES = [
	{ value: "BREAKFAST", label: "Breakfast" },
	{ value: "LUNCH", label: "Lunch" },
	{ value: "DINNER", label: "Dinner" },
] as const;

export const MEAL_TIME_VALUES = ["BREAKFAST", "LUNCH", "DINNER"] as const;

export type MealTimeValue = (typeof MEAL_TIME_VALUES)[number];
