import "server-only";
import {
	Document,
	Page,
	renderToBuffer,
	StyleSheet,
	Text,
	View,
} from "@react-pdf/renderer";
import { formatKobo } from "../constants";

export interface ReceiptData {
	orderNumber: string;
	buyerName: string;
	vendorName: string;
	createdAt: Date;
	fulfillmentType: string;
	items: Array<{ name: string; quantity: number; subtotalKobo: number }>;
	subtotalKobo: number;
	deliveryFeeKobo: number;
	platformFeeKobo: number;
	paymentProcessingFeeKobo?: number;
	totalKobo: number;
}

const styles = StyleSheet.create({
	page: { padding: 32, fontSize: 11, fontFamily: "Helvetica" },
	title: { fontSize: 20, marginBottom: 4, color: "#E8590C" },
	sub: { fontSize: 10, color: "#666", marginBottom: 16 },
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 4,
	},
	hr: { borderBottomWidth: 1, borderBottomColor: "#ddd", marginVertical: 8 },
	bold: { fontFamily: "Helvetica-Bold" },
	meta: { marginBottom: 12 },
});

export async function generateReceiptPdf(data: ReceiptData): Promise<Buffer> {
	const doc = (
		<Document>
			<Page size="A4" style={styles.page}>
				<Text style={styles.title}>PreChop</Text>
				<Text style={styles.sub}>Order receipt</Text>

				<View style={styles.meta}>
					<View style={styles.row}>
						<Text>Order</Text>
						<Text style={styles.bold}>{data.orderNumber}</Text>
					</View>
					<View style={styles.row}>
						<Text>Buyer</Text>
						<Text>{data.buyerName}</Text>
					</View>
					<View style={styles.row}>
						<Text>Vendor</Text>
						<Text>{data.vendorName}</Text>
					</View>
					<View style={styles.row}>
						<Text>Fulfillment</Text>
						<Text>{data.fulfillmentType}</Text>
					</View>
					<View style={styles.row}>
						<Text>Date</Text>
						<Text>{data.createdAt.toLocaleString("en-NG")}</Text>
					</View>
				</View>

				<View style={styles.hr} />

				{data.items.map((it, i) => (
					<View style={styles.row} key={`${it.name}-${i}`}>
						<Text>
							{it.quantity}× {it.name}
						</Text>
						<Text>{formatKobo(it.subtotalKobo)}</Text>
					</View>
				))}

				<View style={styles.hr} />

				<View style={styles.row}>
					<Text>Subtotal</Text>
					<Text>{formatKobo(data.subtotalKobo)}</Text>
				</View>
				{data.deliveryFeeKobo > 0 && (
					<View style={styles.row}>
						<Text>Delivery</Text>
						<Text>{formatKobo(data.deliveryFeeKobo)}</Text>
					</View>
				)}
				<View style={styles.row}>
					<Text>Service fee</Text>
					<Text>
						{formatKobo(
							data.paymentProcessingFeeKobo ??
								data.platformFeeKobo,
						)}
					</Text>
				</View>
				<View style={styles.hr} />
				<View style={styles.row}>
					<Text style={styles.bold}>Total</Text>
					<Text style={styles.bold}>
						{formatKobo(data.totalKobo)}
					</Text>
				</View>
			</Page>
		</Document>
	);

	return (await renderToBuffer(doc)) as Buffer;
}
