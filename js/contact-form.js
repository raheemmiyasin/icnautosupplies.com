(function () {
	const form = document.getElementById("contact-form");
	if (!form) return;

	const statusEl = document.getElementById("contact-form-status");
	const submitBtn = document.getElementById("contact-submit");
	let turnstileWidgetId = null;

	function setStatus(message, isError) {
		if (!statusEl) return;
		statusEl.hidden = false;
		statusEl.textContent = message;
		statusEl.className = isError ? "contact-form-status contact-form-status--error" : "contact-form-status contact-form-status--success";
	}

	function setLoading(loading) {
		if (submitBtn) {
			submitBtn.disabled = loading;
			submitBtn.value = loading ? "Sending…" : "Submit";
		}
	}

	async function loadTurnstile(siteKey) {
		if (!siteKey) return;

		await new Promise(function (resolve, reject) {
			if (window.turnstile) {
				resolve();
				return;
			}
			const script = document.createElement("script");
			script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
			script.async = true;
			script.onload = resolve;
			script.onerror = reject;
			document.head.appendChild(script);
		});

		const container = document.getElementById("contact-turnstile");
		if (!container || !window.turnstile) return;

		turnstileWidgetId = window.turnstile.render(container, {
			sitekey: siteKey,
			theme: "light",
		});
	}

	async function init() {
		const container = document.getElementById("contact-turnstile");
		const embeddedKey = container?.dataset.sitekey;
		let siteKey = embeddedKey || "";

		if (!siteKey) {
			try {
				const res = await fetch("/api/contact-config");
				if (res.ok) {
					const config = await res.json();
					siteKey = config.turnstileSiteKey || "";
				}
			} catch {
				// Turnstile is optional; form still works with honeypot
			}
		}

		await loadTurnstile(siteKey);
	}

	form.addEventListener("submit", async function (event) {
		event.preventDefault();
		setStatus("", false);

		const formData = new FormData(form);
		const payload = {
			name: formData.get("name"),
			email: formData.get("email"),
			message: formData.get("message"),
			website: formData.get("website"),
		};

		if (window.turnstile && turnstileWidgetId !== null) {
			payload.turnstileToken = window.turnstile.getResponse(turnstileWidgetId);
		}

		setLoading(true);

		try {
			const res = await fetch("/api/contact", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			const data = await res.json();

			if (!res.ok || !data.ok) {
				setStatus(data.error || "Something went wrong. Please try again.", true);
				if (window.turnstile && turnstileWidgetId !== null) {
					window.turnstile.reset(turnstileWidgetId);
				}
				return;
			}

			form.reset();
			setStatus(data.message || "Thank you! Your message has been sent.", false);
			if (window.turnstile && turnstileWidgetId !== null) {
				window.turnstile.reset(turnstileWidgetId);
			}
		} catch {
			setStatus("Network error. Please check your connection and try again.", true);
		} finally {
			setLoading(false);
		}
	});

	init();
})();
