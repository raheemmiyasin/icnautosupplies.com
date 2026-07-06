export async function onRequestGet(context) {
	const { env } = context;
	return new Response(
		JSON.stringify({
			turnstileSiteKey: env.TURNSTILE_SITE_KEY || "",
		}),
		{
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "public, max-age=300",
			},
		},
	);
}
