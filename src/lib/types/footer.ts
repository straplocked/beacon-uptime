export type FooterItem =
  | { type: "text"; content: string }
  | { type: "copyright"; companyName: string }
  | { type: "link"; label: string; url: string };

export interface FooterSection {
  items: FooterItem[];
}

export interface FooterConfig {
  sections: {
    left?: FooterSection;
    center?: FooterSection;
    right?: FooterSection;
  };
  showPoweredBy: boolean;
  showRss: boolean;
}

export type DisplayStyle = "bars" | "chart" | "compact";
