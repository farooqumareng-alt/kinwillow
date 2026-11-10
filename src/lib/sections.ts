// The 10 Family Continuity Checklist sections, as wizard steps.
// Prompts mirror the published checklist PDF verbatim in substance.
export type Category = "account" | "subscription" | "document" | "device" | "person" | "other";

export interface SectionDef {
  n: number;
  title: string;
  intro?: string;
  category: Category;
  prompts: string[];
}

export const SECTIONS: SectionDef[] = [
  {
    n: 1,
    title: "First calls",
    category: "person",
    prompts: [
      "The first person to call (name, relationship, phone)",
      "Second person to call (name, relationship, phone)",
      "Who should be told in person before anything is posted online",
    ],
  },
  {
    n: 2,
    title: "People",
    category: "person",
    prompts: [
      "Spouse / partner (name, phone, email)",
      "Children (names, phones)",
      "Parents (names, phones)",
      "Executor of your will (name, phone)",
      "Trusted contact #2 and #3 (names, phones, emails)",
    ],
  },
  {
    n: 3,
    title: "The essentials",
    category: "document",
    prompts: [
      "Will — does one exist? Where is the original? Which attorney prepared it?",
      "Power of attorney / healthcare directive — where are they stored?",
      "Passport, driver's license, birth certificate — where stored",
      "Property deeds and vehicle titles — where stored",
      "Safe / lockbox — location and how it opens (code location, not the code)",
    ],
  },
  {
    n: 4,
    title: "Money",
    category: "account",
    prompts: [
      "Banks and credit unions (institution + account type; last 4 digits only)",
      "Credit cards (issuer + last 4 digits)",
      "Investment and retirement accounts (provider)",
      "Debts — mortgage, loans (provider + how each is paid)",
      "Life insurance (company, where the policy is, agent)",
      "Health, home, and auto insurance (company, policy location, agent)",
    ],
  },
  {
    n: 5,
    title: "Digital life",
    category: "account",
    prompts: [
      "Primary email account (provider + how account recovery works — recovery email / phone)",
      "Mobile phone (carrier + where the unlock method is kept)",
      "Password manager (which one + where the master recovery is kept)",
      "Apple ID — Legacy Contact switched on? (yes / no)",
      "Google account — Inactive Account Manager set up? (yes / no)",
      "Facebook / Instagram — legacy / memorialisation setting done? (yes / no)",
    ],
  },
  {
    n: 6,
    title: "Subscriptions and bills",
    intro: "List every service that bills you. For each: name, amount, how often, and the instruction — cancel or keep.",
    category: "subscription",
    prompts: [
      "Streaming and entertainment",
      "Software and apps",
      "Storage (cloud, photo storage)",
      "Gym, clubs, memberships",
      "Domains and websites you own",
      "Utilities and bills on autopay",
    ],
  },
  {
    n: 7,
    title: "Devices",
    category: "device",
    prompts: [
      "Phones (whose, and where unlock instructions are kept)",
      "Computers and tablets (whose, unlock instructions location)",
      "Home router / Wi-Fi (admin account is where?)",
      "Security cameras and smart locks (admin account is where?)",
    ],
  },
  {
    n: 8,
    title: "Work and business",
    category: "account",
    prompts: [
      "Employer (name, HR or manager contact)",
      "Business or side-business accounts someone would need to keep running or wind down",
      "Professional licenses or memberships",
    ],
  },
  {
    n: 9,
    title: "Keep or cancel",
    category: "other",
    prompts: [
      "Photos and files that must be preserved (where they live)",
      "Accounts to close right away",
      "Sentimental items and where they are",
    ],
  },
  {
    n: 10,
    title: "Renewals that must not lapse",
    intro: "The dates that cause real damage if missed. (This is the section everyone forgets to update.)",
    category: "subscription",
    prompts: [
      "Insurance renewals (dates)",
      "Domain renewals (dates)",
      "Licenses and registrations (dates)",
      "Memberships you intend to keep (dates)",
    ],
  },
];

export const CATEGORY_LABELS: Record<Category, string> = {
  account: "Account",
  subscription: "Subscription",
  document: "Document",
  device: "Device",
  person: "Person",
  other: "Other",
};
