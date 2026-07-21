// src/lib/gemini.js
//
// A tiny, dependency-free Google Gemini client for the analytics AI narrative.
// Talks to the Generative Language REST API with the global fetch, so no SDK is
// pulled in. It is intentionally minimal: one text-in / text-out call. Unset
// GEMINI_API_KEY leaves it "not configured" so the feature stays inert.
import ENV from "../config/env.js";

/** Whether an API key is present. Callers check this before generating. */
export function isConfigured() {
  return Boolean(ENV.GEMINI_API_KEY);
}

/**
 * Generates plain text for a prompt. Throws if unconfigured or on an API error
 * (the caller wraps this so a provider hiccup never 500s the dashboard).
 *
 * @param {string} prompt
 * @param {{ temperature?: number, maxOutputTokens?: number }} [options]
 * @returns {Promise<string>}
 */
export async function generateText(prompt, { temperature = 0.4, maxOutputTokens = 900 } = {}) {
  if (!ENV.GEMINI_API_KEY) {
    throw new Error("Gemini is not configured (GEMINI_API_KEY unset).");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${ENV.GEMINI_MODEL}:generateContent?key=${ENV.GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gemini request failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const data = await response.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((part) => part.text).join("") ?? "";
  return text.trim();
}
