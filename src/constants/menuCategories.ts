export const MENU_CATEGORIES = [
	{ value: "MEALS", label: "Meals", icon: "🍲" },
	{
		value: "FAST_FOOD_GRILLS",
		label: "Fast Food & Grills",
		icon: "🍔",
	},
	{
		value: "SNACKS_PASTRIES",
		label: "Snacks & Pastries",
		icon: "🥟",
	},
	{
		value: "CAKES_DESSERTS",
		label: "Cakes & Desserts",
		icon: "🍰",
	},
	{ value: "DRINKS", label: "Drinks", icon: "🥤" },
] as const;

export type MenuCategoryValue = (typeof MENU_CATEGORIES)[number]["value"];

export const MENU_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
	MENU_CATEGORIES.map((c) => [c.value, c.label]),
);

export const MENU_CATEGORY_ICONS: Record<string, string> = Object.fromEntries(
	MENU_CATEGORIES.map((c) => [c.value, c.icon]),
);

export function normalizeMenuCategory(category: string): MenuCategoryValue {
	if (category === "SNACKS") return "SNACKS_PASTRIES";
	if (category === "BAKED_GOODS") return "CAKES_DESSERTS";
	if (category in MENU_CATEGORY_LABELS) return category as MenuCategoryValue;
	return "MEALS";
}

export interface OptionGroupSuggestion {
	name: string;
	required?: boolean;
	minSelect?: number;
	maxSelect?: number | null;
	options: Array<{ name: string; priceNaira: number }>;
}

export const CATEGORY_OPTION_GROUP_SUGGESTIONS: Record<
	MenuCategoryValue,
	OptionGroupSuggestion[]
> = {
	MEALS: [
		{
			name: "Protein",
			required: false,
			minSelect: 0,
			maxSelect: 1,
			options: [
				{ name: "Chicken", priceNaira: 0 },
				{ name: "Beef", priceNaira: 0 },
				{ name: "Fish", priceNaira: 0 },
			],
		},
		{
			name: "Extras",
			required: false,
			minSelect: 0,
			maxSelect: null,
			options: [
				{ name: "Extra rice", priceNaira: 0 },
				{ name: "Plantain", priceNaira: 0 },
				{ name: "Extra sauce", priceNaira: 0 },
			],
		},
	],
	FAST_FOOD_GRILLS: [
		{
			name: "Size",
			required: true,
			minSelect: 1,
			maxSelect: 1,
			options: [
				{ name: "Regular", priceNaira: 0 },
				{ name: "Large", priceNaira: 0 },
			],
		},
		{
			name: "Protein",
			required: false,
			minSelect: 0,
			maxSelect: 1,
			options: [
				{ name: "Chicken", priceNaira: 0 },
				{ name: "Beef", priceNaira: 0 },
				{ name: "Fish", priceNaira: 0 },
			],
		},
		{
			name: "Spice level",
			required: false,
			minSelect: 0,
			maxSelect: 1,
			options: [
				{ name: "Mild", priceNaira: 0 },
				{ name: "Medium", priceNaira: 0 },
				{ name: "Hot", priceNaira: 0 },
			],
		},
		{
			name: "Add-ons",
			required: false,
			minSelect: 0,
			maxSelect: null,
			options: [
				{ name: "Cheese", priceNaira: 0 },
				{ name: "Extra sauce", priceNaira: 0 },
				{ name: "Fries", priceNaira: 0 },
			],
		},
	],
	SNACKS_PASTRIES: [
		{
			name: "Quantity / pack size",
			required: true,
			minSelect: 1,
			maxSelect: 1,
			options: [
				{ name: "Single", priceNaira: 0 },
				{ name: "Pack of 3", priceNaira: 0 },
				{ name: "Pack of 6", priceNaira: 0 },
			],
		},
		{
			name: "Filling",
			required: false,
			minSelect: 0,
			maxSelect: 1,
			options: [
				{ name: "Meat", priceNaira: 0 },
				{ name: "Chicken", priceNaira: 0 },
				{ name: "Vegetable", priceNaira: 0 },
			],
		},
		{
			name: "Flavour",
			required: false,
			minSelect: 0,
			maxSelect: 1,
			options: [
				{ name: "Plain", priceNaira: 0 },
				{ name: "Chocolate", priceNaira: 0 },
				{ name: "Vanilla", priceNaira: 0 },
			],
		},
	],
	CAKES_DESSERTS: [
		{
			name: "Size",
			required: true,
			minSelect: 1,
			maxSelect: 1,
			options: [
				{ name: "Small", priceNaira: 0 },
				{ name: "Medium", priceNaira: 0 },
				{ name: "Large", priceNaira: 0 },
			],
		},
		{
			name: "Flavour",
			required: false,
			minSelect: 0,
			maxSelect: 1,
			options: [
				{ name: "Vanilla", priceNaira: 0 },
				{ name: "Chocolate", priceNaira: 0 },
				{ name: "Red velvet", priceNaira: 0 },
			],
		},
		{
			name: "Toppings",
			required: false,
			minSelect: 0,
			maxSelect: null,
			options: [
				{ name: "Sprinkles", priceNaira: 0 },
				{ name: "Fruit", priceNaira: 0 },
				{ name: "Chocolate drizzle", priceNaira: 0 },
			],
		},
		{
			name: "Custom message",
			required: false,
			minSelect: 0,
			maxSelect: 1,
			options: [
				{ name: "No message", priceNaira: 0 },
				{ name: "Add message", priceNaira: 0 },
			],
		},
	],
	DRINKS: [
		{
			name: "Size",
			required: false,
			minSelect: 0,
			maxSelect: 1,
			options: [
				{ name: "Small", priceNaira: 0 },
				{ name: "Regular", priceNaira: 0 },
				{ name: "Large", priceNaira: 0 },
			],
		},
		{
			name: "Temperature",
			required: false,
			minSelect: 0,
			maxSelect: 1,
			options: [
				{ name: "Chilled", priceNaira: 0 },
				{ name: "Room temperature", priceNaira: 0 },
			],
		},
	],
};
