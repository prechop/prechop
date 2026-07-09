"use client";

import { useState } from "react";
import useSWR from "swr";
import {
	Button,
	Card,
	Input,
	PageHeader,
	Select,
	Stack,
	Text,
	Textarea,
} from "@/components";
import { api, apiData } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { useToast } from "@/hooks/useToast";

interface Campus {
	id: string;
	name: string;
}

export default function AdminNotificationsWrapper() {
	const { toast } = useToast();
	const { data: campuses } = useSWR<Campus[]>("/campuses", fetcher);
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [campusId, setCampusId] = useState("");
	const [busy, setBusy] = useState(false);

	async function send() {
		if (!title.trim() || !body.trim()) {
			toast("Title and message are required.", "error");
			return;
		}
		setBusy(true);
		try {
			const res = await apiData<{ recipients: number }>(
				api.post("/admin/notifications", {
					title,
					body,
					...(campusId ? { campusId } : {}),
				}),
			);
			toast(`Sent to ${res.recipients} users.`, "success");
			setTitle("");
			setBody("");
		} catch {
			toast("Failed to send broadcast.", "error");
		} finally {
			setBusy(false);
		}
	}

	return (
		<Stack $gap={20}>
			<PageHeader
				eyebrow="Engagement"
				title="Broadcast notification"
				subtitle="Send an in-app + push notification to buyers and vendors."
			/>
			<Card>
				<Stack $gap={14}>
					<div>
						<Text $muted $size={13}>
							Title
						</Text>
						<Input
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="e.g. Free delivery this weekend!"
							maxLength={120}
						/>
					</div>
					<div>
						<Text $muted $size={13}>
							Message
						</Text>
						<Textarea
							value={body}
							onChange={(e) => setBody(e.target.value)}
							placeholder="What do you want to tell everyone?"
							rows={4}
							maxLength={500}
						/>
					</div>
					<div>
						<Text $muted $size={13}>
							Audience
						</Text>
						<Select
							value={campusId}
							onChange={(e) => setCampusId(e.target.value)}
						>
							<option value="">All campuses</option>
							{(campuses ?? []).map((c) => (
								<option key={c.id} value={c.id}>
									{c.name}
								</option>
							))}
						</Select>
					</div>
					<Button onClick={send} $loading={busy} disabled={busy}>
						Send broadcast
					</Button>
				</Stack>
			</Card>
		</Stack>
	);
}
