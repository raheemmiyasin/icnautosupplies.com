(function () {
	const form = document.getElementById("contact-form");
	if (!form) return;

	const statusEl = document.getElementById("contact-form-status");
	const submitBtn = document.getElementById("contact-submit");

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
				return;
			}

			form.reset();
			setStatus(data.message || "Thank you! Your message has been sent.", false);
		} catch {
			setStatus("Network error. Please check your connection and try again.", true);
		} finally {
			setLoading(false);
		}
	});
})();
