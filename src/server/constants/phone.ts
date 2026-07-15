export const NIGERIAN_PHONE_ERROR_MESSAGE =
	"Enter a valid Nigerian phone number.";

const NIGERIAN_MOBILE_PREFIX =
	/^(?:70[1-9]|80[1-9]|81\d|90[1-9]|91[2-6])\d{7}$/;

export function normalizeNigerianMobilePhone(value: string): string | null {
	const phone = value.trim();
	let nationalNumber: string | null = null;

	if (/^0\d{10}$/.test(phone)) {
		nationalNumber = phone.slice(1);
	} else if (/^234\d{10}$/.test(phone)) {
		nationalNumber = phone.slice(3);
	} else if (/^\+234\d{10}$/.test(phone)) {
		nationalNumber = phone.slice(4);
	}

	if (!nationalNumber || !NIGERIAN_MOBILE_PREFIX.test(nationalNumber)) {
		return null;
	}

	return `+234${nationalNumber}`;
}
