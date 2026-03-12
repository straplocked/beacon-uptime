import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { statusPages, incidents, incidentUpdates } from "@/lib/db/schema";
import { eq, desc, asc } from "drizzle-orm";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const [page] = await db
    .select()
    .from(statusPages)
    .where(eq(statusPages.slug, slug))
    .limit(1);

  if (!page || !page.isPublic) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const recentIncidents = await db
    .select()
    .from(incidents)
    .where(eq(incidents.statusPageId, page.id))
    .orderBy(desc(incidents.createdAt))
    .limit(50);

  const items: string[] = [];

  for (const incident of recentIncidents) {
    const updates = await db
      .select()
      .from(incidentUpdates)
      .where(eq(incidentUpdates.incidentId, incident.id))
      .orderBy(asc(incidentUpdates.createdAt));

    const description = updates
      .map(
        (u) =>
          `<p><strong>${escapeXml(u.status)}</strong> (${new Date(u.createdAt).toUTCString()}): ${escapeXml(u.message)}</p>`
      )
      .join("\n");

    const baseUrl = process.env.BASE_URL || "https://beacon.pluginsynthesis.com";

    items.push(`    <item>
      <title>${escapeXml(incident.title)}</title>
      <link>${baseUrl}/s/${escapeXml(page.slug)}</link>
      <guid isPermaLink="false">${incident.id}</guid>
      <pubDate>${new Date(incident.createdAt).toUTCString()}</pubDate>
      <description><![CDATA[${description}]]></description>
    </item>`);
  }

  const baseUrl = process.env.BASE_URL || "https://beacon.pluginsynthesis.com";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(page.name)} - Status Updates</title>
    <link>${baseUrl}/s/${escapeXml(page.slug)}</link>
    <description>Status updates for ${escapeXml(page.name)}</description>
    <atom:link href="${baseUrl}/s/${escapeXml(page.slug)}/rss" rel="self" type="application/rss+xml"/>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items.join("\n")}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
