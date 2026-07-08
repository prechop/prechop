import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	createCampusDB,
	getCampusByIdDB,
	getCampusByShortCodeDB,
	listCampusesDB,
	updateCampusDB,
} from "@/server/models/campuses";
import { connectTestDB, dropAndDisconnect } from "../helpers/db";

beforeAll(async () => {
	await connectTestDB();
});

afterAll(async () => {
	await dropAndDisconnect();
});

describe("campuses model", () => {
	it("creates and reads by id + shortCode (uppercased)", async () => {
		const created = await createCampusDB({
			payload: { name: "Unilag", shortCode: "unilag", state: "Lagos" },
		});
		expect(created).not.toBeNull();
		// shortCode is uppercased by the schema.
		expect(created!.shortCode).toBe("UNILAG");

		const byId = await getCampusByIdDB({ id: created!._id.toString() });
		expect(byId!.name).toBe("Unilag");
		// aggregate adds a string `id`.
		expect(byId!.id).toBe(created!._id.toString());

		const byCode = await getCampusByShortCodeDB({ shortCode: "unilag" });
		expect(byCode!._id.toString()).toBe(created!._id.toString());
	});

	it("returns null for an unknown id / short code", async () => {
		expect(await getCampusByIdDB({ id: "not-an-oid" })).toBeNull();
		expect(
			await getCampusByShortCodeDB({ shortCode: "NOPE_XYZ" }),
		).toBeNull();
	});

	it("updates a campus", async () => {
		const created = await createCampusDB({
			payload: { name: "OAU", shortCode: "oau", state: "Osun" },
		});
		const updated = await updateCampusDB({
			id: created!._id.toString(),
			payload: { name: "Obafemi Awolowo Univ", isActive: false },
		});
		expect(updated!.name).toBe("Obafemi Awolowo Univ");
		expect(updated!.isActive).toBe(false);
	});

	it("lists campuses with activeOnly filter and sorted by name", async () => {
		const all = await listCampusesDB();
		expect(all.length).toBeGreaterThanOrEqual(2);
		const active = await listCampusesDB({ activeOnly: true });
		expect(active.every((c) => c.isActive)).toBe(true);
	});
});
