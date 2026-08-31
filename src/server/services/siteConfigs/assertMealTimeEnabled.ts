import { validationError } from "../../constants";
import { getSiteConfigs } from "./getSiteConfigs";
import { MealTime } from "@/server/models";

export function assertMealTimeEnabled(
	config: Awaited<ReturnType<typeof getSiteConfigs>>,
	mealTime: MealTime,
): boolean {
	switch (mealTime) {
		case MealTime.BREAKFAST:
			return config.breakfastEnabled;
		case MealTime.LUNCH:
			return config.lunchEnabled;
		case MealTime.DINNER:
			return config.dinnerEnabled;
		default:
			return false;
	}
}

export function mealTimeEnabled(config: Awaited<ReturnType<typeof getSiteConfigs>>, mealTime: MealTime): boolean {
	return assertMealTimeEnabled(config, mealTime);
}
