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

	const accessKey = env.WEB3FORMS_ACCESS_KEY;
	if (!accessKey) {
		console.error("WEB3FORMS_ACCESS_KEY is not configured");
		return jsonResponse(
			{ ok: false, error: "Contact form is not configured yet. Please email us directly." },
			503,
		);
	}

	try {
		const response = await fetch("https://api.web3forms.com/submit", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({
				access_key: accessKey,
				name: name.trim(),
				email: email.trim(),
				message: message.trim(),
				subject: `Website enquiry from ${name.trim()}`,
				from_name: env.CONTACT_FROM_NAME || "ICN Auto Supplies Website",
			}),
		});

		const result = await response.json();
		if (!response.ok || !result.success) {
			console.error("Web3Forms error:", result);
			throw new Error(result.message || "Email delivery failed");
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
