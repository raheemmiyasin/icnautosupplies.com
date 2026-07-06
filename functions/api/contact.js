const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json",
			"Access-Control-Allow-Origin": "*",
		},
	});
}

async function verifyTurnstile(token, secret, ip) {
	const form = new FormData();
	form.append("secret", secret);
	form.append("response", token);
	if (ip) form.append("remoteip", ip);

	const result = await fetch(
		"https://challenges.cloudflare.com/turnstile/v0/siteverify",
		{ method: "POST", body: form },
	);
	const data = await result.json();
	return data.success === true;
}

export async function onRequestOptions() {
	return new Response(null, {
		status: 204,
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		},
	});
}

export async function onRequestPost(context) {
	const { request, env } = context;

	let payload;
	try {
		payload = await request.json();
	} catch {
		return jsonResponse({ ok: false, error: "Invalid request body." }, 400);
	}

	const { name, email, message, turnstileToken, website } = payload;

	if (website) {
		return jsonResponse({ ok: true });
	}

	if (!name?.trim() || !email?.trim() || !message?.trim()) {
		return jsonResponse({ ok: false, error: "Please fill in all required fields." }, 400);
	}

	if (!EMAIL_RE.test(email.trim())) {
		return jsonResponse({ ok: false, error: "Please enter a valid email address." }, 400);
	}

	if (name.length > 200 || email.length > 254 || message.length > 5000) {
		return jsonResponse({ ok: false, error: "One or more fields are too long." }, 400);
	}

	if (env.TURNSTILE_SECRET_KEY) {
		if (!turnstileToken) {
			return jsonResponse({ ok: false, error: "Please complete the security check." }, 400);
		}
		const ip = request.headers.get("CF-Connecting-IP");
		const valid = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, ip);
		if (!valid) {
			return jsonResponse({ ok: false, error: "Security check failed. Please try again." }, 403);
		}
	}

	const toEmail = env.CONTACT_TO_EMAIL || "icnautosupplies@gmail.com";
	const fromEmail = env.CONTACT_FROM_EMAIL || "noreply@icnautosupplies.com";
	const fromName = env.CONTACT_FROM_NAME || "ICN Auto Supplies Website";

	const subject = `Website enquiry from ${name.trim()}`;
	const text = [
		`Name: ${name.trim()}`,
		`Email: ${email.trim()}`,
		"",
		"Message:",
		message.trim(),
	].join("\n");

	const html = `
		<h2>New contact form submission</h2>
		<p><strong>Name:</strong> ${escapeHtml(name.trim())}</p>
		<p><strong>Email:</strong> ${escapeHtml(email.trim())}</p>
		<p><strong>Message:</strong></p>
		<p>${escapeHtml(message.trim()).replace(/\n/g, "<br>")}</p>
	`;

	try {
		const accountId = env.CLOUDFLARE_ACCOUNT_ID;
		const apiToken = env.CLOUDFLARE_API_TOKEN;

		if (!accountId || !apiToken) {
			throw new Error("Email service is not configured.");
		}

		const response = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					from: { address: fromEmail, name: fromName },
					to: [{ address: toEmail }],
					reply_to: { address: email.trim(), name: name.trim() },
					subject,
					text,
					html,
				}),
			},
		);

		const result = await response.json();
		if (!response.ok || !result.success) {
			console.error("Email API error:", result);
			throw new Error("Email API request failed");
		}
	} catch (err) {
		console.error("Email send failed:", err);
		return jsonResponse(
			{ ok: false, error: "Unable to send your message right now. Please email us directly." },
			500,
		);
	}

	return jsonResponse({ ok: true, message: "Thank you! Your message has been sent." });
}

function escapeHtml(value) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
