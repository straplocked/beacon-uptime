"use client";

import type { FooterConfig, FooterItem } from "@/lib/types/footer";

interface StatusPageFooterProps {
  slug: string;
  footerText: string | null;
  footerConfig: FooterConfig | null;
}

function renderItem(item: FooterItem, i: number) {
  switch (item.type) {
    case "text":
      return (
        <p key={i} className="text-sm" style={{ color: "var(--sp-text-3)" }}>
          {item.content}
        </p>
      );
    case "copyright":
      return (
        <p
          key={i}
          className="text-sm"
          style={{ color: "var(--sp-text-3)" }}
          suppressHydrationWarning
        >
          &copy; {new Date().getFullYear()} {item.companyName}
        </p>
      );
    case "link":
      return (
        <a
          key={i}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm hover:opacity-70 transition-opacity"
          style={{ color: "var(--sp-text-3)" }}
        >
          {item.label}
        </a>
      );
  }
}

export function StatusPageFooter({
  slug,
  footerText,
  footerConfig,
}: StatusPageFooterProps) {
  const showRss = footerConfig?.showRss ?? true;
  const showPoweredBy = footerConfig?.showPoweredBy ?? true;

  return (
    <div
      className="mt-20 pt-8"
      style={{ borderTop: "1px solid var(--sp-border)" }}
    >
      {footerConfig ? (
        <div className="grid grid-cols-3 gap-4 mb-4">
          {/* Left */}
          <div className="flex flex-col gap-1 items-start">
            {footerConfig.sections.left?.items.map((item, i) =>
              renderItem(item, i)
            )}
          </div>
          {/* Center */}
          <div className="flex flex-col gap-1 items-center text-center">
            {footerConfig.sections.center?.items.map((item, i) =>
              renderItem(item, i)
            )}
          </div>
          {/* Right */}
          <div className="flex flex-col gap-1 items-end text-right">
            {footerConfig.sections.right?.items.map((item, i) =>
              renderItem(item, i)
            )}
          </div>
        </div>
      ) : (
        footerText && (
          <p
            className="mb-3 text-sm text-center"
            style={{ color: "var(--sp-text-3)" }}
          >
            {footerText}
          </p>
        )
      )}

      <div
        className="flex items-center justify-center gap-4"
        style={{ color: "var(--sp-text-4)" }}
      >
        {showRss && (
          <a
            href={`/s/${slug}/rss`}
            className="hover:opacity-70 transition-opacity"
            title="RSS Feed"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 11a9 9 0 0 1 9 9" />
              <path d="M4 4a16 16 0 0 1 16 16" />
              <circle cx="5" cy="19" r="1" />
            </svg>
          </a>
        )}
        {showPoweredBy && (
          <p className="text-xs">
            Powered by{" "}
            <a
              href="https://beacon.pluginsynthesis.com"
              className="hover:opacity-70 transition-opacity"
            >
              Beacon
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
