import { NextResponse } from "next/server";

// Endpoint barato para healthcheck (Docker, GitHub Actions deploy step).
export const GET = () => NextResponse.json({ status: "ok" });
