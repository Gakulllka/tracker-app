import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, apiKey, model } = body as {
      messages: Array<{
        role: string;
        parts: Array<{ text: string }>;
      }>;
      apiKey: string;
      model?: string;
    };

    if (!apiKey || typeof apiKey !== "string") {
      return NextResponse.json(
        { error: "API key is required" },
        { status: 400 }
      );
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages array is required and must not be empty" },
        { status: 400 }
      );
    }

    const chatModel = model || "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${chatModel}:generateContent`;

    const geminiRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: messages,
        generationConfig: { maxOutputTokens: 4096 },
      }),
    });

    if (!geminiRes.ok) {
      const errorData = await geminiRes.json().catch(() => null);
      const message =
        errorData?.error?.message ||
        `Gemini API error: ${geminiRes.status} ${geminiRes.statusText}`;
      return NextResponse.json({ error: message }, { status: geminiRes.status });
    }

    const data = await geminiRes.json();

    if (data.error) {
      return NextResponse.json(
        { error: data.error.message || "Gemini returned an error" },
        { status: 400 }
      );
    }

    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return NextResponse.json({ text });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
