import { NextResponse } from "next/server"

// Local storage mode serves avatars statically from public/uploads, so there is
// no private-object route to proxy. Kept as a 404 for URL compatibility.
export async function GET(
  _req: Request,
  _context: { params: Promise<{ file: string[] }> }
) {
  return new NextResponse("Not found", { status: 404 })
}